/**
 * OCR.space API provider — the "OCR API" image text-extraction route.
 *
 * This is the alternative to the vision-LLM OCR path (`runImageDocumentOcr`).
 * The user picks the route in the AI Panel upload step; when `ocr_api` is
 * chosen the image text-extraction step calls this instead of the vision
 * model. Everything downstream (classification + finance field extraction)
 * is unchanged — both routes produce the same `text` shape.
 *
 * Recommended config (OCR.space): OCREngine=3 (auto language + best layout),
 * isTable=true, scale=true, detectOrientation=true, isOverlayRequired=false,
 * isCreateSearchablePdf=false.
 *
 * Free-tier constraint: a single file must be ≤ 1 MB. The client preprocesses
 * the image to fit (see `buildOcrApiVersion` in src/lib/utils/preprocess-image.ts)
 * and uploads it as the `ocr_optimized` derived ref, so the bytes that reach
 * here are already within budget. We keep a hard guard anyway.
 */

const DEFAULT_ENDPOINT = 'https://api.ocr.space/parse/image';
const DEFAULT_ENGINE = '3';
/** OCR.space free tier rejects files larger than 1 MB. */
const FREE_TIER_MAX_BYTES = 1024 * 1024;

/** Transient HTTP statuses worth retrying (rate limit + gateway/proxy errors). */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 700;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Strip HTML tags / collapse whitespace from an error body for a short, useful message. */
function summarizeBody(raw: string): string {
	return raw
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 120);
}

export type OcrSpaceResult =
	| { ok: true; text: string; engine: string; exitCode: number }
	| { ok: false; error: string };

function readEnv(platformEnv: Env, key: string): string {
	const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
	const fromPlatform = (platformEnv as unknown as Record<string, unknown>)[key];
	if (typeof fromPlatform === 'string' && fromPlatform.trim()) return fromPlatform.trim();
	const fromProcess = processEnv?.[key];
	return typeof fromProcess === 'string' ? fromProcess.trim() : '';
}

/**
 * OCR.space `filetype` hint. AI-Panel uploads arrive pre-encoded as JPEG, but
 * server-originated uploads (e.g. Lark) send the raw file untouched — so we must
 * map every format OCR.space accepts. A wrong hint (e.g. labelling a TIFF as JPG)
 * makes OCR.space only partially decode the image → truncated text.
 */
function fileTypeHint(mimeType: string, fileName: string): 'JPG' | 'PNG' | 'GIF' | 'TIF' | 'BMP' | 'PDF' {
	const m = mimeType.toLowerCase();
	const n = fileName.toLowerCase();
	if (m.includes('pdf') || n.endsWith('.pdf')) return 'PDF';
	if (m.includes('png') || n.endsWith('.png')) return 'PNG';
	if (m.includes('gif') || n.endsWith('.gif')) return 'GIF';
	if (m.includes('tif') || /\.tiff?$/.test(n)) return 'TIF';
	if (m.includes('bmp') || n.endsWith('.bmp')) return 'BMP';
	return 'JPG';
}

interface OcrSpaceParsedResult {
	ParsedText?: string;
	ErrorMessage?: string;
	FileParseExitCode?: number;
}

interface OcrSpaceResponse {
	ParsedResults?: OcrSpaceParsedResult[];
	OCRExitCode?: number;
	IsErroredOnProcessing?: boolean;
	ErrorMessage?: string | string[];
	ErrorDetails?: string;
}

function joinErrorMessage(raw: string | string[] | undefined): string {
	if (!raw) return '';
	return Array.isArray(raw) ? raw.filter(Boolean).join('; ') : raw;
}

export async function runOcrSpaceOcr(
	env: Env,
	input: { imageBytes: Uint8Array; mimeType: string; fileName: string }
): Promise<OcrSpaceResult> {
	const apiKey = readEnv(env, 'OCR_SPACE_API_KEY');
	if (!apiKey) {
		return { ok: false, error: 'OCR_SPACE_API_KEY is not configured for the OCR API route.' };
	}
	if (input.imageBytes.length === 0) {
		return { ok: false, error: 'Empty image payload.' };
	}

	const endpoint = readEnv(env, 'OCR_SPACE_ENDPOINT') || DEFAULT_ENDPOINT;
	const isFreeTier = endpoint === DEFAULT_ENDPOINT;
	if (isFreeTier && input.imageBytes.length > FREE_TIER_MAX_BYTES) {
		return {
			ok: false,
			error: `Image is ${input.imageBytes.length} bytes; OCR.space free tier caps a single file at ${FREE_TIER_MAX_BYTES} bytes.`
		};
	}

	const engine = readEnv(env, 'OCR_SPACE_ENGINE') || DEFAULT_ENGINE;

	const form = new FormData();
	form.append('OCREngine', engine);
	form.append('isTable', 'true');
	form.append('scale', 'true');
	form.append('detectOrientation', 'true');
	form.append('isOverlayRequired', 'false');
	form.append('isCreateSearchablePdf', 'false');
	form.append('filetype', fileTypeHint(input.mimeType, input.fileName));
	// Engine 3 auto-detects language; engines 1/2 need an explicit code. Only
	// send `language` when not on engine 3 so we don't break the auto path.
	if (engine !== '3') form.append('language', readEnv(env, 'OCR_SPACE_LANGUAGE') || 'eng');

	const lowerMime = input.mimeType.toLowerCase();
	const mime = lowerMime.includes('pdf')
		? 'application/pdf'
		: lowerMime.startsWith('image/')
			? input.mimeType
			: 'image/jpeg';
	// Copy into a fresh ArrayBuffer so Blob doesn't capture an oversized view.
	const ab = input.imageBytes.slice().buffer;
	form.append('file', new Blob([ab], { type: mime }), input.fileName || 'document.jpg');

	// OCR.space free tier is rate-limited (HTTP 429) and its gateway intermittently
	// times out (HTTP 504 with a non-JSON HTML body). Both are transient — retry a
	// few times with exponential backoff + jitter before giving up.
	let lastError = 'OCR.space request failed.';
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		if (attempt > 1) {
			await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 2) + Math.floor(Math.random() * 250));
		}

		let response: Response;
		try {
			response = await fetch(endpoint, {
				method: 'POST',
				headers: { apikey: apiKey },
				body: form
			});
		} catch (e) {
			lastError = `OCR.space unreachable: ${e instanceof Error ? e.message : String(e)}`;
			continue; // network blip — retry
		}

		// Read the raw body first: on 429/5xx OCR.space replies with an HTML error
		// page, so `response.json()` would throw and mask the real status.
		const rawBody = await response.text().catch(() => '');

		if (!response.ok) {
			const hint =
				response.status === 429
					? 'rate limited (free tier allows limited concurrency / daily quota)'
					: summarizeBody(rawBody) || 'unknown';
			lastError = `OCR.space HTTP ${response.status}: ${hint}`;
			if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_ATTEMPTS) continue;
			return { ok: false, error: lastError };
		}

		let data: OcrSpaceResponse;
		try {
			data = JSON.parse(rawBody) as OcrSpaceResponse;
		} catch {
			lastError = `OCR.space returned non-JSON (status ${response.status}).`;
			if (attempt < MAX_ATTEMPTS) continue; // likely a transient 200-with-HTML proxy hiccup
			return { ok: false, error: lastError };
		}

		// OCRExitCode: 1 = success, 2 = partial success, 3 = error, 4 = fatal.
		const exitCode = data.OCRExitCode ?? 0;
		if (data.IsErroredOnProcessing || exitCode >= 3) {
			const detail = joinErrorMessage(data.ErrorMessage) || data.ErrorDetails || 'processing error';
			lastError = `OCR.space failed (exit ${exitCode}): ${detail}`;
			// "Timed out waiting for results" is transient; other errors are not.
			if (/tim(e|ed)\s?out|timeout/i.test(detail) && attempt < MAX_ATTEMPTS) continue;
			return { ok: false, error: lastError };
		}

		const text = (data.ParsedResults ?? [])
			.map((r) => (typeof r.ParsedText === 'string' ? r.ParsedText : ''))
			.join('\n')
			.replace(/\r\n/g, '\n')
			.trim();

		if (!text || text.length < 4) {
			return { ok: false, error: 'OCR.space returned no usable text.' };
		}

		return { ok: true, text, engine, exitCode };
	}

	return { ok: false, error: lastError };
}
