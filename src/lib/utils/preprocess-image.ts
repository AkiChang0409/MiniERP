/**
 * Client-side image preprocessing for OCR.
 *
 * Targets vision-LLM accuracy on identifier-heavy documents (invoice numbers,
 * GST numbers, product codes). Pipeline:
 *
 *   1. EXIF orientation correction (createImageBitmap with `from-image`)
 *   2. Resize so the longest edge ≤ OCR_MAX_LONG_SIDE, with high-quality
 *      downsampling (avoids resize-induced blur on phone photos)
 *   3. Document detection + perspective de-warp (OpenCV.js, best-effort —
 *      falls through silently if no rectangle is confidently detected)
 *   4. Unsharp-mask sharpening — crispens character edges so similar
 *      glyphs (O/0, I/1, S/5, B/8) are easier to disambiguate
 *   5. JPEG re-encode at high quality
 *
 * What this function deliberately does NOT do:
 *   - Greyscale / binarisation (would hurt the vision LLM, which uses colour
 *     for stamps, highlights and ink-vs-paper cues).
 *   - Strong global contrast stretch (clips faint small digits).
 *   - Skew correction via Hough lines (the perspective warp in step 3
 *     usually subsumes this; add later if needed for occluded-edge docs).
 */

import { tryWarpDocument } from './document-warp';

const OCR_MAX_LONG_SIDE = 2048;
const JPEG_QUALITY = 0.95;
/** Unsharp-mask amount. 0=off, 0.5=subtle, 0.8=moderate, 1.2=risk of ringing. */
const SHARPEN_AMOUNT = 0.8;
/** Unsharp-mask blur radius (CSS-filter pixels). Small = fine-detail edges. */
const SHARPEN_RADIUS = 1;

export interface PreprocessImageOptions {
	/**
	 * `'full'` (default): decode → resize → OpenCV document de-warp → unsharp
	 * mask → JPEG. Best OCR quality but pulls in OpenCV.js (~10 MB WASM) on
	 * first use.
	 *
	 * `'convert'`: decode → resize → JPEG. No OpenCV, no per-pixel CPU loop.
	 * Use for pure format conversion (TIFF/BMP → JPEG) where the source is
	 * already a clean scanner output and the slow path's quality gains aren't
	 * worth the WASM first-load cost.
	 */
	mode?: 'full' | 'convert';
}

export async function preprocessImageForOcr(
	input: Blob,
	fileName?: string,
	options: PreprocessImageOptions = {}
): Promise<File> {
	const sourceName = fileName ?? (input instanceof File ? input.name : 'image.jpg');
	const mode = options.mode ?? 'full';
	const passthrough = (): File =>
		input instanceof File
			? input
			: new File([input], sourceName, { type: input.type || 'image/jpeg' });

	const mime = (input.type || '').toLowerCase();
	if (mime === 'image/svg+xml') return passthrough();
	const looksTiff = isTiff(mime, sourceName);
	if (!mime.startsWith('image/') && !looksTiff) return passthrough();

	// 1. Decode to a canvas at OCR_MAX_LONG_SIDE. Browsers can't decode TIFF
	//    natively, so route TIFF through utif2 first; everything else uses
	//    createImageBitmap so EXIF orientation is honoured.
	let canvas = await decodeToCanvas(input, looksTiff).catch(() => null);
	if (!canvas) return passthrough();

	try {
		if (mode === 'full') {
			// 3. Best-effort document detection + perspective de-warp.
			try {
				const warped = await tryWarpDocument(canvas);
				if (warped) {
					const refit = fitToLongSide(warped.width, warped.height, OCR_MAX_LONG_SIDE);
					canvas = drawCanvasTo(warped, refit.width, refit.height) ?? canvas;
				}
			} catch {
				/* warp failed — keep the EXIF-corrected, resized canvas */
			}

			// 4. Sharpen.
			const ctx = canvas.getContext('2d');
			if (ctx) applyUnsharpMask(ctx, SHARPEN_AMOUNT, SHARPEN_RADIUS);
		}

		// 5. Export JPEG.
		const blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY);
		if (!blob) return passthrough();
		const outName = sourceName.replace(/\.[^.]+$/, '_ocr.jpg');
		return new File([blob], outName, { type: 'image/jpeg' });
	} catch {
		return passthrough();
	}
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

function fitToLongSide(w: number, h: number, maxLong: number): { width: number; height: number } {
	const longSide = Math.max(w, h);
	if (longSide <= maxLong) return { width: w, height: h };
	const scale = maxLong / longSide;
	return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function drawTo(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement | null {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(source, 0, 0, width, height);
	return canvas;
}

function drawCanvasTo(src: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement | null {
	if (src.width === width && src.height === height) return src;
	return drawTo(src, width, height);
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

const TIFF_EXT_RE = /\.tiff?$/i;
const TIFF_MIME_RE = /^image\/tiff?$/i;

function isTiff(mime: string, name: string): boolean {
	return TIFF_MIME_RE.test(mime) || TIFF_EXT_RE.test(name);
}

async function decodeToCanvas(input: Blob, looksTiff: boolean): Promise<HTMLCanvasElement | null> {
	if (looksTiff) {
		const native = await decodeTiffToCanvas(input);
		if (!native) return null;
		const fit = fitToLongSide(native.width, native.height, OCR_MAX_LONG_SIDE);
		return drawCanvasTo(native, fit.width, fit.height);
	}
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });
	} catch {
		return null;
	}
	const fit = fitToLongSide(bitmap.width, bitmap.height, OCR_MAX_LONG_SIDE);
	const out = drawTo(bitmap, fit.width, fit.height);
	bitmap.close();
	return out;
}

async function decodeTiffToCanvas(input: Blob): Promise<HTMLCanvasElement | null> {
	const UTIF = await import('utif2');
	const buf = await input.arrayBuffer();
	const ifds = UTIF.decode(buf);
	if (!ifds.length) return null;
	const ifd = ifds[0]!;
	UTIF.decodeImage(buf, ifd);
	const rgba = UTIF.toRGBA8(ifd);
	const w = ifd.width;
	const h = ifd.height;
	if (!w || !h) return null;
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	const img = ctx.createImageData(w, h);
	img.data.set(rgba);
	ctx.putImageData(img, 0, 0);
	return canvas;
}

function canvasToBlob(
	canvas: HTMLCanvasElement,
	type: string,
	quality: number
): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Unsharp mask: sharp = orig + amount × (orig − blurred).
 * Uses the canvas `filter` property for a fast GPU-accelerated Gaussian
 * blur, then a single CPU pass for the per-pixel blend.
 */
function applyUnsharpMask(ctx: CanvasRenderingContext2D, amount: number, radius: number): void {
	if (amount <= 0) return;
	const { width, height } = ctx.canvas;

	const orig = ctx.getImageData(0, 0, width, height);

	const blurCanvas = document.createElement('canvas');
	blurCanvas.width = width;
	blurCanvas.height = height;
	const bctx = blurCanvas.getContext('2d');
	if (!bctx) return; // can't sharpen without a working blur canvas
	bctx.filter = `blur(${radius}px)`;
	bctx.drawImage(ctx.canvas, 0, 0);
	const blurred = bctx.getImageData(0, 0, width, height);

	const o = orig.data;
	const b = blurred.data;
	for (let i = 0; i < o.length; i += 4) {
		// R
		let v = o[i]! + amount * (o[i]! - b[i]!);
		o[i] = v < 0 ? 0 : v > 255 ? 255 : v;
		// G
		v = o[i + 1]! + amount * (o[i + 1]! - b[i + 1]!);
		o[i + 1] = v < 0 ? 0 : v > 255 ? 255 : v;
		// B
		v = o[i + 2]! + amount * (o[i + 2]! - b[i + 2]!);
		o[i + 2] = v < 0 ? 0 : v > 255 ? 255 : v;
		// alpha unchanged
	}
	ctx.putImageData(orig, 0, 0);
}
