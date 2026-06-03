/**
 * Pre-upload image quality assessment for financial document capture.
 *
 * Runs in the browser the moment a photo is selected, so the user can re-shoot
 * before anything is uploaded. This matters more than any post-processing:
 * when a photo is badly out of focus, sharpening only crispens edges — it
 * cannot recover the real glyphs.
 *
 * Metrics (and the thresholds the UI reacts to):
 *   - longestEdge        px of the source's longer side (resolution)
 *   - laplacianVariance  focus / blur proxy (variance of a 3×3 Laplacian)
 *   - brightness         mean luma 0–255 (under/over-exposure)
 *   - documentAreaRatio  detected paper area ÷ frame area (optional)
 *   - skewAngle          detected paper tilt in degrees (optional)
 *
 * `documentAreaRatio` / `skewAngle` need contour detection, which lives in the
 * OpenCV-backed warp module. To keep this file WASM-free and decoupled, the
 * caller injects a `detect` callback; when it is absent (or returns null) those
 * two checks are simply skipped.
 *
 * All findings are advisory. The capture UI shows soft reminders but never
 * blocks the upload — financial documents are often one-of-a-kind and cannot
 * be re-shot.
 */

/** Working canvas long side. Blur/brightness are measured here (not full res)
 *  so the thresholds are stable across phone megapixel counts. */
const WORK_LONG_SIDE = 1000;

export const QUALITY_THRESHOLDS = {
	/** Source longest edge (px). */
	longEdge: { reshootBelow: 1800, warnBelow: 2500 },
	/** Laplacian variance — lower is blurrier. */
	blur: { reshootBelow: 80, warnBelow: 150 },
	/** Mean luma 0–255. */
	brightness: { darkReshoot: 60, darkWarn: 90, brightWarn: 220, brightReshoot: 240 },
	/** Detected document area ÷ frame area. */
	areaRatio: { reshootBelow: 0.45, warnBelow: 0.6 },
	/** Detected tilt (degrees, absolute). */
	skew: { reshootAbove: 15, warnAbove: 5 }
} as const;

export type QualitySeverity = 'reshoot' | 'warn';

export interface QualityFinding {
	metric: 'resolution' | 'blur' | 'brightness' | 'coverage' | 'skew';
	severity: QualitySeverity;
	/** Short user-facing message (English; the panel renders it verbatim). */
	message: string;
}

export interface DocumentDetection {
	/** Detected paper area ÷ full frame area, 0–1. */
	areaRatio: number;
	/** Tilt of the detected paper in degrees (absolute value used for skew). */
	skewAngle: number;
}

export interface ImageQualityMetrics {
	longestEdge: number;
	laplacianVariance: number;
	brightness: number;
	documentAreaRatio?: number;
	skewAngle?: number;
}

export interface ImageQualityResult {
	metrics: ImageQualityMetrics;
	findings: QualityFinding[];
	/** Worst severity across findings, or null when the image looks fine. */
	worst: QualitySeverity | null;
}

export interface AssessImageQualityOptions {
	/**
	 * Optional document detector. Receives the (downscaled) working canvas and
	 * returns coverage + skew, or null when no paper boundary is found. Inject
	 * the OpenCV-backed `detectDocumentQuad` here; omit it to skip those checks.
	 */
	detect?: (canvas: HTMLCanvasElement) => Promise<DocumentDetection | null>;
}

/**
 * Assess a freshly-selected image. Best-effort: if the image cannot be decoded
 * the result has empty findings (we never block on our own failure to read it).
 */
export async function assessImageQuality(
	input: Blob,
	options: AssessImageQualityOptions = {}
): Promise<ImageQualityResult> {
	const empty: ImageQualityResult = {
		metrics: { longestEdge: 0, laplacianVariance: 0, brightness: 0 },
		findings: [],
		worst: null
	};

	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });
	} catch {
		return empty;
	}

	const longestEdge = Math.max(bitmap.width, bitmap.height);
	const scale = longestEdge > WORK_LONG_SIDE ? WORK_LONG_SIDE / longestEdge : 1;
	const w = Math.max(1, Math.round(bitmap.width * scale));
	const h = Math.max(1, Math.round(bitmap.height * scale));

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) {
		bitmap.close();
		return empty;
	}
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bitmap, 0, 0, w, h);
	bitmap.close();

	const { data } = ctx.getImageData(0, 0, w, h);
	const gray = toGrayscale(data, w * h);
	const brightness = mean(gray);
	const laplacianVariance = laplacianVar(gray, w, h);

	let detection: DocumentDetection | null = null;
	if (options.detect) {
		detection = await options.detect(canvas).catch(() => null);
	}

	const metrics: ImageQualityMetrics = {
		longestEdge,
		laplacianVariance,
		brightness,
		documentAreaRatio: detection?.areaRatio,
		skewAngle: detection ? Math.abs(detection.skewAngle) : undefined
	};

	const findings = deriveFindings(metrics);
	return { metrics, findings, worst: worstOf(findings) };
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

function deriveFindings(m: ImageQualityMetrics): QualityFinding[] {
	const t = QUALITY_THRESHOLDS;
	const findings: QualityFinding[] = [];

	if (m.longestEdge > 0 && m.longestEdge < t.longEdge.reshootBelow) {
		findings.push({
			metric: 'resolution',
			severity: 'reshoot',
			message: `Low resolution (${m.longestEdge}px). Shoot closer or at higher quality — aim for 2500px+ on the long edge.`
		});
	} else if (m.longestEdge > 0 && m.longestEdge < t.longEdge.warnBelow) {
		findings.push({
			metric: 'resolution',
			severity: 'warn',
			message: `Resolution is a bit low (${m.longestEdge}px). 2500–3500px reads best.`
		});
	}

	if (m.laplacianVariance > 0 && m.laplacianVariance < t.blur.reshootBelow) {
		findings.push({
			metric: 'blur',
			severity: 'reshoot',
			message: 'Image looks out of focus. Hold steady and re-shoot — blur cannot be recovered later.'
		});
	} else if (m.laplacianVariance > 0 && m.laplacianVariance < t.blur.warnBelow) {
		findings.push({
			metric: 'blur',
			severity: 'warn',
			message: 'Slightly soft focus. A sharper photo improves number recognition.'
		});
	}

	if (m.brightness > 0) {
		if (m.brightness < t.brightness.darkReshoot) {
			findings.push({ metric: 'brightness', severity: 'reshoot', message: 'Too dark. Add light or move away from shadow.' });
		} else if (m.brightness > t.brightness.brightReshoot) {
			findings.push({ metric: 'brightness', severity: 'reshoot', message: 'Overexposed — text is washed out. Reduce glare / direct light.' });
		} else if (m.brightness < t.brightness.darkWarn) {
			findings.push({ metric: 'brightness', severity: 'warn', message: 'A little dark. More even lighting helps.' });
		} else if (m.brightness > t.brightness.brightWarn) {
			findings.push({ metric: 'brightness', severity: 'warn', message: 'A little bright. Watch for glare on the paper.' });
		}
	}

	if (m.documentAreaRatio !== undefined) {
		if (m.documentAreaRatio < t.areaRatio.reshootBelow) {
			findings.push({ metric: 'coverage', severity: 'reshoot', message: 'Document fills too little of the frame. Move closer so it covers most of the photo.' });
		} else if (m.documentAreaRatio < t.areaRatio.warnBelow) {
			findings.push({ metric: 'coverage', severity: 'warn', message: 'Try filling more of the frame with the document.' });
		}
	}

	if (m.skewAngle !== undefined) {
		if (m.skewAngle > t.skew.reshootAbove) {
			findings.push({ metric: 'skew', severity: 'reshoot', message: `Document is tilted (${Math.round(m.skewAngle)}°). Shoot square-on.` });
		} else if (m.skewAngle > t.skew.warnAbove) {
			findings.push({ metric: 'skew', severity: 'warn', message: `Slight tilt (${Math.round(m.skewAngle)}°) — we'll straighten it, but square-on is best.` });
		}
	}

	return findings;
}

function worstOf(findings: QualityFinding[]): QualitySeverity | null {
	if (findings.some((f) => f.severity === 'reshoot')) return 'reshoot';
	if (findings.length > 0) return 'warn';
	return null;
}

// ---------------------------------------------------------------------------
// Pixel math
// ---------------------------------------------------------------------------

function toGrayscale(rgba: Uint8ClampedArray, pixelCount: number): Float32Array {
	const gray = new Float32Array(pixelCount);
	for (let i = 0, p = 0; p < pixelCount; p++, i += 4) {
		// Rec. 601 luma.
		gray[p] = 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
	}
	return gray;
}

function mean(values: Float32Array): number {
	let sum = 0;
	for (let i = 0; i < values.length; i++) sum += values[i]!;
	return values.length ? sum / values.length : 0;
}

/**
 * Variance of the 3×3 discrete Laplacian over the interior pixels. This is the
 * standard "variance of Laplacian" focus measure: a crisp image has strong
 * edge responses (high variance); a blurry one has weak responses (low
 * variance).
 */
function laplacianVar(gray: Float32Array, w: number, h: number): number {
	if (w < 3 || h < 3) return 0;
	let sum = 0;
	let sumSq = 0;
	let n = 0;
	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			const i = y * w + x;
			const lap =
				4 * gray[i]! - gray[i - 1]! - gray[i + 1]! - gray[i - w]! - gray[i + w]!;
			sum += lap;
			sumSq += lap * lap;
			n++;
		}
	}
	if (n === 0) return 0;
	const m = sum / n;
	return sumSq / n - m * m;
}
