/**
 * Document detection + perspective de-warp using OpenCV.js.
 *
 * Primary pipeline (`detectDocumentQuad`):
 *   1. Grayscale + Gaussian blur (denoise)
 *   2. Canny edge detection
 *   3. Dilate to close edge gaps
 *   4. Find external contours
 *   5. Approximate each contour as a polygon; keep 4-vertex candidates
 *      that cover ≥ MIN_AREA_RATIO of the image
 *   6. Pick the largest such quadrilateral
 *
 * Fallback (when no clean quadrilateral is found — occluded or low-contrast
 * edges): adaptive threshold → largest external contour → minAreaRect. Paper
 * is usually brighter than the desk, so the thresholded foreground is the
 * sheet; its rotated bounding box gives us both a quad to warp and a skew
 * angle. Returns null only when even the fallback finds nothing large enough.
 *
 * `tryWarpDocument` (detect → four-point transform) keeps the original
 * single-call contract for existing callers. `detectDocumentQuad` /
 * `warpToQuad` are split out so the quality-assessment pass can read coverage
 * + skew without paying for a warp, and so callers can deskew separately.
 */

import { loadOpenCv } from './opencv-loader';

const MIN_AREA_RATIO = 0.25; // primary contour must cover ≥ 25% of the frame
const FALLBACK_MIN_AREA_RATIO = 0.3; // threshold fallback wants a clearly dominant sheet
const APPROX_EPSILON_RATIO = 0.02; // polygon-simplification tolerance (× perimeter)

export type Point = { x: number; y: number };

/** Geometry of a detected document, in source-canvas pixel coordinates. */
export interface DetectedQuad {
	/** Corners ordered [top-left, top-right, bottom-right, bottom-left]. */
	quad: [Point, Point, Point, Point];
	/** Detected paper area ÷ full frame area, 0–1. */
	areaRatio: number;
	/** Tilt of the top/bottom edges relative to horizontal, in degrees
	 *  (signed; positive = rotated clockwise). */
	skewAngle: number;
}

interface CvMat {
	delete(): void;
	rows: number;
	cols: number;
	intAt(row: number, col: number): number;
}

interface CvMatVector extends CvMat {
	size(): number;
	get(index: number): CvMat;
}

interface CvHandle {
	Mat: new (...args: unknown[]) => CvMat;
	MatVector: new () => CvMatVector;
	Size: new (w: number, h: number) => unknown;
	[key: string]: unknown;
}

function callCv<T>(cv: CvHandle, name: string, ...args: unknown[]): T {
	return (cv[name] as (...a: unknown[]) => T)(...args);
}

/**
 * Detect a rectangular document in `srcCanvas`. Returns its ordered corners,
 * coverage ratio, and skew angle, or `null` when no sheet is confidently
 * found. Does not modify or warp the canvas.
 */
export async function detectDocumentQuad(
	srcCanvas: HTMLCanvasElement
): Promise<DetectedQuad | null> {
	let cv: CvHandle;
	try {
		cv = (await loadOpenCv()) as unknown as CvHandle;
	} catch {
		return null;
	}

	const src = callCv<CvMat>(cv, 'imread', srcCanvas);
	const gray = new cv.Mat();
	const work = new cv.Mat();
	const contours = new cv.MatVector();
	const hierarchy = new cv.Mat();

	try {
		const totalArea = src.rows * src.cols;
		if (totalArea === 0) return null;

		callCv(cv, 'cvtColor', src, gray, cv.COLOR_RGBA2GRAY);

		// --- Primary: Canny edges → largest 4-vertex contour ------------------
		callCv(cv, 'GaussianBlur', gray, work, new cv.Size(5, 5), 0);
		callCv(cv, 'Canny', work, work, 75, 200);
		const kernel = (cv.Mat as unknown as { ones: (r: number, c: number, t: unknown) => CvMat })
			.ones(3, 3, cv.CV_8U);
		callCv(cv, 'dilate', work, work, kernel);
		kernel.delete();
		callCv(cv, 'findContours', work, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

		let bestQuad: Point[] | null = null;
		let bestArea = 0;
		for (let i = 0; i < contours.size(); i++) {
			const contour = contours.get(i);
			const perimeter = callCv<number>(cv, 'arcLength', contour, true);
			const approx = new cv.Mat();
			callCv(cv, 'approxPolyDP', contour, approx, APPROX_EPSILON_RATIO * perimeter, true);
			if (approx.rows === 4) {
				const a = callCv<number>(cv, 'contourArea', approx);
				if (a > totalArea * MIN_AREA_RATIO && a > bestArea) {
					const pts: Point[] = [];
					for (let j = 0; j < 4; j++) pts.push({ x: approx.intAt(j, 0), y: approx.intAt(j, 1) });
					bestQuad = pts;
					bestArea = a;
				}
			}
			approx.delete();
		}

		if (bestQuad) {
			const ordered = orderCorners(bestQuad);
			return { quad: ordered, areaRatio: bestArea / totalArea, skewAngle: skewOf(ordered) };
		}

		// --- Fallback: adaptive threshold → largest contour → minAreaRect -----
		const fallback = detectByThreshold(cv, gray, contours, totalArea);
		return fallback;
	} catch {
		return null;
	} finally {
		src.delete();
		gray.delete();
		work.delete();
		contours.delete();
		hierarchy.delete();
	}
}

function detectByThreshold(
	cv: CvHandle,
	gray: CvMat,
	contours: CvMatVector,
	totalArea: number
): DetectedQuad | null {
	const bin = new cv.Mat();
	const hierarchy2 = new cv.Mat();
	try {
		// Blur a little then adaptive-threshold: paper (bright) → foreground.
		callCv(cv, 'GaussianBlur', gray, bin, new cv.Size(5, 5), 0);
		callCv(
			cv,
			'adaptiveThreshold',
			bin,
			bin,
			255,
			cv.ADAPTIVE_THRESH_GAUSSIAN_C,
			cv.THRESH_BINARY,
			51,
			10
		);
		// Close gaps so the sheet is one solid blob.
		const k = (cv.Mat as unknown as { ones: (r: number, c: number, t: unknown) => CvMat })
			.ones(7, 7, cv.CV_8U);
		callCv(cv, 'morphologyEx', bin, bin, cv.MORPH_CLOSE, k);
		k.delete();

		callCv(cv, 'findContours', bin, contours, hierarchy2, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

		let bestContour: CvMat | null = null;
		let bestArea = 0;
		for (let i = 0; i < contours.size(); i++) {
			const c = contours.get(i);
			const a = callCv<number>(cv, 'contourArea', c);
			if (a > bestArea) {
				bestArea = a;
				bestContour = c;
			}
		}
		if (!bestContour || bestArea < totalArea * FALLBACK_MIN_AREA_RATIO) return null;

		const rect = callCv<{ center: { x: number; y: number }; size: { width: number; height: number }; angle: number }>(
			cv,
			'minAreaRect',
			bestContour
		);
		const cornerPts = rotatedRectPoints(cv, rect);
		if (!cornerPts) return null;
		const ordered = orderCorners(cornerPts);
		const rectArea = rect.size.width * rect.size.height;
		return {
			quad: ordered,
			areaRatio: Math.min(1, rectArea / totalArea),
			skewAngle: normalizeSkew(rect.angle)
		};
	} catch {
		return null;
	} finally {
		bin.delete();
		hierarchy2.delete();
	}
}

/** Read the 4 corner points of a cv RotatedRect. The opencv-js build exposes
 *  this as `cv.RotatedRect.points(rect)` returning an array of `{x,y}`. */
function rotatedRectPoints(
	cv: CvHandle,
	rect: { center: { x: number; y: number }; size: { width: number; height: number }; angle: number }
): Point[] | null {
	const RR = cv.RotatedRect as unknown as { points?: (r: unknown) => Point[] } | undefined;
	if (RR && typeof RR.points === 'function') {
		const pts = RR.points(rect);
		if (Array.isArray(pts) && pts.length === 4) return pts.map((p) => ({ x: p.x, y: p.y }));
	}
	// Manual corner reconstruction from center/size/angle (degrees).
	const { center, size, angle } = rect;
	const rad = (angle * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	const hw = size.width / 2;
	const hh = size.height / 2;
	const offsets = [
		[-hw, -hh],
		[hw, -hh],
		[hw, hh],
		[-hw, hh]
	];
	return offsets.map(([dx, dy]) => ({
		x: center.x + dx! * cos - dy! * sin,
		y: center.y + dx! * sin + dy! * cos
	}));
}

/**
 * Warp a detected quadrilateral (source-canvas coordinates) to an upright
 * rectangle. Target dimensions follow the quad's real edge lengths — we do NOT
 * force an A4 aspect ratio, because invoice / receipt / packing-list proportions
 * vary and stretching to A4 would distort glyphs and hurt OCR.
 */
export async function warpToQuad(
	srcCanvas: HTMLCanvasElement,
	quad: [Point, Point, Point, Point]
): Promise<HTMLCanvasElement | null> {
	let cv: CvHandle;
	try {
		cv = (await loadOpenCv()) as unknown as CvHandle;
	} catch {
		return null;
	}

	const src = callCv<CvMat>(cv, 'imread', srcCanvas);
	const warped = new cv.Mat();
	let srcPts: CvMat | null = null;
	let dstPts: CvMat | null = null;
	let M: CvMat | null = null;
	try {
		const [tl, tr, br, bl] = quad;
		const targetWidth = Math.round(Math.max(dist(br, bl), dist(tr, tl)));
		const targetHeight = Math.round(Math.max(dist(tr, br), dist(tl, bl)));
		if (targetWidth < 50 || targetHeight < 50) return null;

		srcPts = callCv<CvMat>(cv, 'matFromArray', 4, 1, cv.CV_32FC2, [
			tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y
		]);
		dstPts = callCv<CvMat>(cv, 'matFromArray', 4, 1, cv.CV_32FC2, [
			0, 0, targetWidth, 0, targetWidth, targetHeight, 0, targetHeight
		]);
		M = callCv<CvMat>(cv, 'getPerspectiveTransform', srcPts, dstPts);
		callCv(cv, 'warpPerspective', src, warped, M, new cv.Size(targetWidth, targetHeight));

		const out = document.createElement('canvas');
		out.width = targetWidth;
		out.height = targetHeight;
		callCv(cv, 'imshow', out, warped);
		return out;
	} catch {
		return null;
	} finally {
		src.delete();
		warped.delete();
		srcPts?.delete();
		dstPts?.delete();
		M?.delete();
	}
}

/**
 * Convenience: detect a document and warp it to an upright rectangle. Returns
 * `null` if no document boundary is confidently detected (caller keeps the
 * un-warped image).
 */
export async function tryWarpDocument(
	srcCanvas: HTMLCanvasElement
): Promise<HTMLCanvasElement | null> {
	const detection = await detectDocumentQuad(srcCanvas);
	if (!detection) return null;
	return warpToQuad(srcCanvas, detection.quad);
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Order four corner points as [top-left, top-right, bottom-right, bottom-left].
 */
function orderCorners(pts: Point[]): [Point, Point, Point, Point] {
	let tl = pts[0]!,
		br = pts[0]!,
		tr = pts[0]!,
		bl = pts[0]!;
	let minSum = Infinity,
		maxSum = -Infinity,
		minDiff = Infinity,
		maxDiff = -Infinity;
	for (const p of pts) {
		const s = p.x + p.y;
		const d = p.x - p.y;
		if (s < minSum) { minSum = s; tl = p; }
		if (s > maxSum) { maxSum = s; br = p; }
		if (d > maxDiff) { maxDiff = d; tr = p; }
		if (d < minDiff) { minDiff = d; bl = p; }
	}
	return [tl, tr, br, bl];
}

/** Skew = average tilt of the top (tl→tr) and bottom (bl→br) edges, degrees. */
function skewOf(quad: [Point, Point, Point, Point]): number {
	const [tl, tr, br, bl] = quad;
	const top = (Math.atan2(tr.y - tl.y, tr.x - tl.x) * 180) / Math.PI;
	const bottom = (Math.atan2(br.y - bl.y, br.x - bl.x) * 180) / Math.PI;
	return (top + bottom) / 2;
}

/** minAreaRect angles are in (-90, 0]; fold into a small ±45° skew. */
function normalizeSkew(angle: number): number {
	let a = angle;
	if (a < -45) a += 90;
	if (a > 45) a -= 90;
	return a;
}

function dist(a: Point, b: Point): number {
	return Math.hypot(b.x - a.x, b.y - a.y);
}
