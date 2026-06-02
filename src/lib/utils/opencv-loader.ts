/**
 * Lazy-loader for OpenCV.js (~10 MB WASM bundle).
 *
 * Only the first preprocessImageForOcr call pays the load cost; subsequent
 * calls reuse the cached promise. Dynamic import lets Vite/SvelteKit split
 * OpenCV into its own chunk so it never bloats the initial page bundle.
 */

// OpenCV.js exposes its API as a single `cv` namespace populated after the
// WASM runtime initialises. The npm package's type bundle is partial, so we
// keep this loosely typed and let callers narrow as needed.
type OpenCv = Record<string, unknown> & {
	Mat: new (...args: unknown[]) => unknown;
	onRuntimeInitialized?: () => void;
};

let cvReady: Promise<OpenCv> | null = null;

/** Bail out of the WASM init wait after this long so callers can fall back
 *  to non-OpenCV paths instead of locking up the page. Has happened on slow
 *  devices / cold CDN fetches where `onRuntimeInitialized` never fires. */
const RUNTIME_INIT_TIMEOUT_MS = 12_000;

export function loadOpenCv(): Promise<OpenCv> {
	if (cvReady) return cvReady;
	cvReady = (async () => {
		const mod = await import('@techstark/opencv-js');
		const cv = (mod.default ?? mod) as OpenCv;
		if (typeof cv.Mat === 'function') return cv;
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error('OpenCV.js runtime init timed out')),
				RUNTIME_INIT_TIMEOUT_MS
			);
			cv.onRuntimeInitialized = () => {
				clearTimeout(timer);
				resolve();
			};
		});
		return cv;
	})().catch((err) => {
		// Clear the cached promise so a later attempt can retry instead of
		// being stuck with a permanently rejected loader.
		cvReady = null;
		throw err;
	});
	return cvReady;
}
