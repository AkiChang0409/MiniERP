/**
 * Document detection + perspective de-warp using OpenCV.js.
 *
 * Pipeline:
 *   1. Grayscale + Gaussian blur (denoise)
 *   2. Canny edge detection
 *   3. Dilate to close edge gaps
 *   4. Find external contours
 *   5. Approximate each contour as a polygon; keep 4-vertex candidates
 *      that cover ≥ MIN_AREA_RATIO of the image
 *   6. Pick the largest such quadrilateral
 *   7. Order its corners (TL, TR, BR, BL) and warp to an upright rectangle
 *
 * Best-effort: if no quadrilateral is found (e.g. the document edges are
 * occluded), returns `null` and the caller keeps the un-warped image. The
 * other preprocessing steps (sharpening, EXIF, resize) still apply.
 */

import { loadOpenCv } from './opencv-loader';

const MIN_AREA_RATIO = 0.25; // contour must cover ≥ 25% of the frame
const APPROX_EPSILON_RATIO = 0.02; // polygon-simplification tolerance (× perimeter)

type Point = { x: number; y: number };

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
 * Attempt to detect a rectangular document in `srcCanvas` and warp it to an
 * upright rectangle. Returns a new canvas with the warped result, or `null`
 * if no document boundary is confidently detected.
 */
export async function tryWarpDocument(srcCanvas: HTMLCanvasElement): Promise<HTMLCanvasElement | null> {
	let cv: CvHandle;
	try {
		cv = (await loadOpenCv()) as unknown as CvHandle;
	} catch {
		return null;
	}

	const src = callCv<CvMat>(cv, 'imread', srcCanvas);
	const gray = new cv.Mat();
	const edges = new cv.Mat();
	const contours = new cv.MatVector();
	const hierarchy = new cv.Mat();

	try {
		// 1. Grayscale
		callCv(cv, 'cvtColor', src, gray, cv.COLOR_RGBA2GRAY);

		// 2. Gaussian blur (5x5) to suppress paper texture / sensor noise
		callCv(cv, 'GaussianBlur', gray, gray, new cv.Size(5, 5), 0);

		// 3. Canny edge detection
		callCv(cv, 'Canny', gray, edges, 75, 200);

		// 4. Dilate so disconnected edge segments merge into closed contours
		const kernel = (cv.Mat as unknown as { ones: (r: number, c: number, t: unknown) => CvMat })
			.ones(3, 3, cv.CV_8U);
		callCv(cv, 'dilate', edges, edges, kernel);
		kernel.delete();

		// 5. Find external contours
		callCv(
			cv,
			'findContours',
			edges,
			contours,
			hierarchy,
			cv.RETR_EXTERNAL,
			cv.CHAIN_APPROX_SIMPLE
		);

		// 6. Find best 4-vertex polygon covering enough area
		const totalArea = src.rows * src.cols;
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
					for (let j = 0; j < 4; j++) {
						pts.push({ x: approx.intAt(j, 0), y: approx.intAt(j, 1) });
					}
					bestQuad = pts;
					bestArea = a;
				}
			}
			approx.delete();
			// Do not delete `contour` — owned by the MatVector and freed when we
			// delete the vector below.
		}

		if (!bestQuad) return null;

		// 7. Order corners (tl, tr, br, bl) and compute target dimensions
		const [tl, tr, br, bl] = orderCorners(bestQuad);
		const targetWidth = Math.round(Math.max(dist(br, bl), dist(tr, tl)));
		const targetHeight = Math.round(Math.max(dist(tr, br), dist(tl, bl)));
		if (targetWidth < 50 || targetHeight < 50) return null;

		const srcPts = callCv<CvMat>(
			cv,
			'matFromArray',
			4,
			1,
			cv.CV_32FC2,
			[tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]
		);
		const dstPts = callCv<CvMat>(
			cv,
			'matFromArray',
			4,
			1,
			cv.CV_32FC2,
			[0, 0, targetWidth, 0, targetWidth, targetHeight, 0, targetHeight]
		);
		const M = callCv<CvMat>(cv, 'getPerspectiveTransform', srcPts, dstPts);
		const warped = new cv.Mat();
		callCv(cv, 'warpPerspective', src, warped, M, new cv.Size(targetWidth, targetHeight));

		const out = document.createElement('canvas');
		out.width = targetWidth;
		out.height = targetHeight;
		callCv(cv, 'imshow', out, warped);

		srcPts.delete();
		dstPts.delete();
		M.delete();
		warped.delete();

		return out;
	} catch {
		return null;
	} finally {
		src.delete();
		gray.delete();
		edges.delete();
		contours.delete();
		hierarchy.delete();
	}
}

/**
 * Order four corner points as [top-left, top-right, bottom-right, bottom-left].
 * - tl has the smallest x+y
 * - br has the largest x+y
 * - tr has the largest x−y
 * - bl has the smallest x−y
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

function dist(a: Point, b: Point): number {
	return Math.hypot(b.x - a.x, b.y - a.y);
}
