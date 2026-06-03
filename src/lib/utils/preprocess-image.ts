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

import { tryWarpDocument, detectDocumentQuad, warpToQuad } from './document-warp';

const OCR_MAX_LONG_SIDE = 2048;
const JPEG_QUALITY = 0.95;
/** Unsharp-mask amount. 0=off, 0.5=subtle, 0.8=moderate, 1.2=risk of ringing. */
const SHARPEN_AMOUNT = 0.8;
/** Unsharp-mask blur radius (CSS-filter pixels). Small = fine-detail edges. */
const SHARPEN_RADIUS = 1;

// --- Financial "vision-enhanced" pipeline tuning ---------------------------
/**
 * Long edge for the version sent to the vision LLM. The default pipeline is
 * pure Canvas2D (no OpenCV/WASM), so 2200px stays fast on the main thread.
 */
const FINANCIAL_MAX_LONG_SIDE = 2200;
/** JPEG quality for the vision-enhanced version. Spec: 90–95. */
const FINANCIAL_JPEG_QUALITY = 0.92;
/** Gentler sharpening than the legacy OCR path (spec: 0.4–0.7). */
const FINANCIAL_SHARPEN_AMOUNT = 0.5;
const FINANCIAL_SHARPEN_RADIUS = 1.2;
/** Below this absolute skew (deg) we don't bother rotating. */
const DESKEW_MIN_DEG = 0.6;
/** Above this we assume the detection is wrong / the doc is rotated 90°+; the
 *  vision LLM handles coarse orientation, so we don't auto-rotate that far. */
const DESKEW_MAX_DEG = 15;

/** Yield to the event loop so the browser can paint between heavy main-thread
 *  steps — prevents the "page not responding" dialog. */
function yieldToMain(): Promise<void> {
	return new Promise((resolve) => {
		if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
		else setTimeout(resolve, 0);
	});
}

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

// ===========================================================================
// Financial "vision-enhanced" pipeline.
//
// Produces TWO versions of a financial photo:
//   - `original`: the untouched upload (audit, human review, vision fallback).
//     We never overwrite it.
//   - `visionEnhanced`: illumination-normalised, gently contrast-stretched and
//     sharpened — the version we send to the vision LLM. Colour is preserved
//     (no binarisation, no table-line removal) because the LLM uses colour for
//     stamps, ink-vs-paper cues and highlights.
//
// The DEFAULT pipeline is pure Canvas2D — no OpenCV / no WASM — so it runs in
// well under a second on the main thread. Perspective de-warp (which needs
// OpenCV contour detection + a 10 MB WASM download) is OPT-IN via
// `options.dewarp`; OpenCV is only loaded when that flag is set.
//
// Every enhancement step is best-effort: a failure in any step falls through
// to the canvas as it was, so we always emit a usable JPEG.
// ===========================================================================

export interface FinancialPreprocessMetrics {
	/** False when the source could not be decoded (visionEnhanced === original). */
	processed: boolean;
	/** True when perspective de-warp ran AND found a document (opt-in, OpenCV). */
	warped: boolean;
	/** Degrees rotated by the deskew fallback (0 when not deskewed). */
	deskewedDeg: number;
	/** Detected document coverage 0–1, when a boundary was found. */
	areaRatio?: number;
	/** Shadow / background illumination normalisation applied. */
	normalized: boolean;
	/** Gentle contrast stretch applied. */
	contrastApplied: boolean;
	/** Unsharp sharpening applied. */
	sharpened: boolean;
	outputWidth: number;
	outputHeight: number;
}

export interface FinancialVersions {
	original: File;
	visionEnhanced: File;
	metrics: FinancialPreprocessMetrics;
}

export interface BuildFinancialVersionsOptions {
	/** Run OpenCV document detection + perspective de-warp first. Lazy-loads the
	 *  ~10 MB OpenCV WASM bundle only when true. Default false. */
	dewarp?: boolean;
}

/**
 * Build the original + vision-enhanced versions of a financial image. The
 * caller uploads both; the vision-enhanced one is what OCR/vision reads.
 */
export async function buildFinancialVersions(
	input: Blob,
	fileName?: string,
	options: BuildFinancialVersionsOptions = {}
): Promise<FinancialVersions> {
	const sourceName = fileName ?? (input instanceof File ? input.name : 'image.jpg');
	const original =
		input instanceof File
			? input
			: new File([input], sourceName, { type: input.type || 'image/jpeg' });

	const idle: FinancialPreprocessMetrics = {
		processed: false,
		warped: false,
		deskewedDeg: 0,
		normalized: false,
		contrastApplied: false,
		sharpened: false,
		outputWidth: 0,
		outputHeight: 0
	};

	const mime = (input.type || '').toLowerCase();
	const looksTiff = isTiff(mime, sourceName);
	if (mime === 'image/svg+xml') return { original, visionEnhanced: original, metrics: idle };
	if (!mime.startsWith('image/') && !looksTiff) {
		return { original, visionEnhanced: original, metrics: idle };
	}

	const canvas = await decodeToCanvas(input, looksTiff, FINANCIAL_MAX_LONG_SIDE).catch(() => null);
	if (!canvas) return { original, visionEnhanced: original, metrics: idle };

	const { canvas: enhanced, metrics } = await enhanceForVision(canvas, options.dewarp ?? false);
	const blob = await canvasToBlob(enhanced, 'image/jpeg', FINANCIAL_JPEG_QUALITY);
	if (!blob) return { original, visionEnhanced: original, metrics: idle };

	const outName = `${sourceName.replace(/\.[^.]+$/, '') || 'document'}_vision.jpg`;
	const visionEnhanced = new File([blob], outName, { type: 'image/jpeg' });
	return { original, visionEnhanced, metrics };
}

async function enhanceForVision(
	input: HTMLCanvasElement,
	dewarp: boolean
): Promise<{ canvas: HTMLCanvasElement; metrics: FinancialPreprocessMetrics }> {
	let canvas = input;
	const metrics: FinancialPreprocessMetrics = {
		processed: true,
		warped: false,
		deskewedDeg: 0,
		normalized: false,
		contrastApplied: false,
		sharpened: false,
		outputWidth: canvas.width,
		outputHeight: canvas.height
	};

	// OPT-IN: detect document → perspective de-warp, else deskew. Loads OpenCV
	// (~10 MB WASM) only when requested.
	if (dewarp) {
		await yieldToMain();
		try {
			const detection = await detectDocumentQuad(canvas);
			if (detection) {
				metrics.areaRatio = detection.areaRatio;
				const warped = await warpToQuad(canvas, detection.quad);
				if (warped) {
					const refit = fitToLongSide(warped.width, warped.height, FINANCIAL_MAX_LONG_SIDE);
					canvas = drawCanvasTo(warped, refit.width, refit.height) ?? warped;
					metrics.warped = true;
				} else {
					const skew = detection.skewAngle;
					if (Math.abs(skew) >= DESKEW_MIN_DEG && Math.abs(skew) <= DESKEW_MAX_DEG) {
						const rotated = rotateCanvas(canvas, -skew);
						if (rotated) {
							canvas = rotated;
							metrics.deskewedDeg = -skew;
						}
					}
				}
			}
		} catch {
			/* keep canvas as-is */
		}
	}

	// Shadow / background illumination normalisation (colour-preserving). Pure
	// Canvas2D — the single most useful step for phone photos of paper.
	await yieldToMain();
	try {
		applyShadowNormalization(canvas);
		metrics.normalized = true;
	} catch {
		/* skip */
	}

	// Gentle global contrast stretch (CLAHE substitute, pure Canvas2D).
	await yieldToMain();
	try {
		applyContrastStretch(canvas);
		metrics.contrastApplied = true;
	} catch {
		/* skip */
	}

	// Gentle unsharp sharpening.
	await yieldToMain();
	try {
		const ctx = canvas.getContext('2d');
		if (ctx) {
			applyUnsharpMask(ctx, FINANCIAL_SHARPEN_AMOUNT, FINANCIAL_SHARPEN_RADIUS);
			metrics.sharpened = true;
		}
	} catch {
		/* skip */
	}

	metrics.outputWidth = canvas.width;
	metrics.outputHeight = canvas.height;
	return { canvas, metrics };
}

function clamp8(v: number): number {
	return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Step 5 — divide the image by a heavily-blurred estimate of the paper's base
 * colour, evening out shadows, creases and uneven lighting. Operates on a
 * per-pixel luma gain so colour is preserved (we do NOT convert to grey).
 */
function applyShadowNormalization(canvas: HTMLCanvasElement): void {
	const { width, height } = canvas;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) return;

	const bgCanvas = document.createElement('canvas');
	bgCanvas.width = width;
	bgCanvas.height = height;
	const bctx = bgCanvas.getContext('2d', { willReadFrequently: true });
	if (!bctx) return;
	// Large-radius blur ≈ background illumination. Scale with image size but
	// cap it (spec sigma ≈ 25–45) so a huge CSS blur can't stall a CPU fallback.
	const radius = Math.min(40, Math.max(18, Math.round(Math.max(width, height) / 40)));
	bctx.filter = `blur(${radius}px)`;
	bctx.drawImage(canvas, 0, 0);

	const orig = ctx.getImageData(0, 0, width, height);
	const bg = bctx.getImageData(0, 0, width, height);
	const o = orig.data;
	const b = bg.data;

	let lumaSum = 0;
	const n = b.length / 4;
	for (let i = 0; i < b.length; i += 4) {
		lumaSum += 0.299 * b[i]! + 0.587 * b[i + 1]! + 0.114 * b[i + 2]!;
	}
	const target = n ? lumaSum / n : 200;

	for (let i = 0; i < o.length; i += 4) {
		const bgLuma = 0.299 * b[i]! + 0.587 * b[i + 1]! + 0.114 * b[i + 2]!;
		let gain = bgLuma > 1 ? target / bgLuma : 1;
		gain = gain < 0.5 ? 0.5 : gain > 2 ? 2 : gain;
		o[i] = clamp8(o[i]! * gain);
		o[i + 1] = clamp8(o[i + 1]! * gain);
		o[i + 2] = clamp8(o[i + 2]! * gain);
	}
	ctx.putImageData(orig, 0, 0);
}

/**
 * Gentle contrast stretch — a fast, pure-Canvas2D substitute for CLAHE. Builds
 * a luma histogram, finds the 0.5% / 99.5% percentiles, and remaps luma to
 * stretch that range to (near) full scale. Applied as a per-pixel luma gain so
 * colour is preserved. Conservative percentiles + a slight pull-back keep it
 * from amplifying paper texture / dotted table rules into fake glyphs.
 */
function applyContrastStretch(canvas: HTMLCanvasElement): void {
	const { width, height } = canvas;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) return;

	const img = ctx.getImageData(0, 0, width, height);
	const d = img.data;
	const n = d.length / 4;
	if (n === 0) return;

	const hist = new Uint32Array(256);
	for (let i = 0; i < d.length; i += 4) {
		const luma = (0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!) | 0;
		hist[luma > 255 ? 255 : luma]!++;
	}

	const lowCut = n * 0.005;
	const highCut = n * 0.005;
	let low = 0;
	let acc = 0;
	for (let v = 0; v < 256; v++) {
		acc += hist[v]!;
		if (acc >= lowCut) {
			low = v;
			break;
		}
	}
	let high = 255;
	acc = 0;
	for (let v = 255; v >= 0; v--) {
		acc += hist[v]!;
		if (acc >= highCut) {
			high = v;
			break;
		}
	}
	if (high - low < 16) return; // already full-range; nothing useful to do

	// Map [low, high] → [8, 247] (slight pull-back from pure 0–255 to avoid
	// crushing faint small digits / blowing out highlights).
	const scale = (247 - 8) / (high - low);
	for (let i = 0; i < d.length; i += 4) {
		const luma = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
		if (luma < 1) continue;
		const stretched = clamp8((luma - low) * scale + 8);
		const gain = stretched / luma;
		d[i] = clamp8(d[i]! * gain);
		d[i + 1] = clamp8(d[i + 1]! * gain);
		d[i + 2] = clamp8(d[i + 2]! * gain);
	}
	ctx.putImageData(img, 0, 0);
}

/** Rotate a canvas by `deg` (clockwise positive), expanding to fit and padding
 *  the corners white so OCR sees paper, not black. */
function rotateCanvas(canvas: HTMLCanvasElement, deg: number): HTMLCanvasElement | null {
	const rad = (deg * Math.PI) / 180;
	const sin = Math.abs(Math.sin(rad));
	const cos = Math.abs(Math.cos(rad));
	const w = canvas.width;
	const h = canvas.height;
	const nw = Math.ceil(w * cos + h * sin);
	const nh = Math.ceil(w * sin + h * cos);
	const out = document.createElement('canvas');
	out.width = nw;
	out.height = nh;
	const ctx = out.getContext('2d');
	if (!ctx) return null;
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, nw, nh);
	ctx.translate(nw / 2, nh / 2);
	ctx.rotate(rad);
	ctx.drawImage(canvas, -w / 2, -h / 2);
	return out;
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

async function decodeToCanvas(
	input: Blob,
	looksTiff: boolean,
	maxLong: number = OCR_MAX_LONG_SIDE
): Promise<HTMLCanvasElement | null> {
	if (looksTiff) {
		const native = await decodeTiffToCanvas(input);
		if (!native) return null;
		const fit = fitToLongSide(native.width, native.height, maxLong);
		return drawCanvasTo(native, fit.width, fit.height);
	}
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });
	} catch {
		return null;
	}
	const fit = fitToLongSide(bitmap.width, bitmap.height, maxLong);
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
