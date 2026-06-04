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

/** OCR.space `filetype` hint. Our client preprocessing emits JPEG; PNG is the
 *  only other lossless raster we forward without re-encoding. */
function fileTypeHint(mimeType: string, fileName: string): 'JPG' | 'PNG' {
	const m = mimeType.toLowerCase();
	const n = fileName.toLowerCase();
	if (m.includes('png') || n.endsWith('.png')) return 'PNG';
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

	const mime = input.mimeType.toLowerCase().startsWith('image/') ? input.mimeType : 'image/jpeg';
	// Copy into a fresh ArrayBuffer so Blob doesn't capture an oversized view.
	const ab = input.imageBytes.slice().buffer;
	form.append('file', new Blob([ab], { type: mime }), input.fileName || 'document.jpg');

	let response: Response;
	try {
		response = await fetch(endpoint, {
			method: 'POST',
			headers: { apikey: apiKey },
			body: form
		});
	} catch (e) {
		return { ok: false, error: `OCR.space unreachable: ${e instanceof Error ? e.message : String(e)}` };
	}

	let data: OcrSpaceResponse;
	try {
		data = (await response.json()) as OcrSpaceResponse;
	} catch {
		return { ok: false, error: `OCR.space returned non-JSON (status ${response.status}).` };
	}

	if (!response.ok) {
		return { ok: false, error: `OCR.space HTTP ${response.status}: ${joinErrorMessage(data.ErrorMessage) || 'unknown'}` };
	}

	// OCRExitCode: 1 = success, 2 = partial success, 3 = error, 4 = fatal.
	const exitCode = data.OCRExitCode ?? 0;
	if (data.IsErroredOnProcessing || exitCode >= 3) {
		const detail = joinErrorMessage(data.ErrorMessage) || data.ErrorDetails || 'processing error';
		return { ok: false, error: `OCR.space failed (exit ${exitCode}): ${detail}` };
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
