import { runOpenAiVisionOcr } from './openai-vision-ocr';
import { runWorkersVisionOcr } from './workers-vision-ocr';

export type ImageOcrProvider = 'openai' | 'workers_ai';
export type ImageOcrPreference = 'auto' | ImageOcrProvider;

export type ImageDocumentOcrResult =
	| { ok: true; text: string; provider: ImageOcrProvider }
	| { ok: false; error: string; provider: ImageOcrProvider };

function readEnv(platformEnv: Env, key: string): string {
	const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
	const fromPlatform = (platformEnv as unknown as Record<string, unknown>)[key];
	if (typeof fromPlatform === 'string' && fromPlatform.trim()) return fromPlatform.trim();
	const fromProcess = processEnv?.[key];
	return typeof fromProcess === 'string' ? fromProcess.trim() : '';
}

function readProviderPreference(env: Env): ImageOcrPreference {
	const value = readEnv(env, 'OCR_IMAGE_PROVIDER').toLowerCase();
	if (value === 'openai' || value === 'workers_ai') return value;
	return 'auto';
}

/**
 * OCR an image document.
 * Uses OpenAI vision (gpt-4o-mini) when OPENAI_API_KEY (or LLM_API_KEY) is
 * set; falls back to Workers AI vision only in `auto` mode.
 *
 * `opts.provider` overrides the env-level `OCR_IMAGE_PROVIDER` preference for a
 * single call — used by the per-upload Vision route choice (External API vs
 * Workers AI). When omitted, the env preference is used (backwards compatible).
 */
export async function runImageDocumentOcr(
	env: Env,
	input: { imageBytes: Uint8Array; mimeType: string; fileName: string },
	opts: { provider?: ImageOcrPreference; promptOverride?: { system: string; user: string } } = {}
): Promise<ImageDocumentOcrResult> {
	const preference = opts.provider ?? readProviderPreference(env);
	const openaiKey = readEnv(env, 'OPENAI_API_KEY') || readEnv(env, 'LLM_API_KEY');
	const promptOverride = opts.promptOverride;

	if (preference !== 'workers_ai') {
		if (!openaiKey && preference === 'openai') {
			return {
				ok: false,
				error: 'OPENAI_API_KEY is not configured for OCR_IMAGE_PROVIDER=openai.',
				provider: 'openai'
			};
		}
		if (!openaiKey) {
			return runWorkersFallback(env, input, promptOverride);
		}
		const result = await runOpenAiVisionOcr(env, { imageBytes: input.imageBytes, mimeType: input.mimeType }, promptOverride);
		if (result.ok) {
			return { ok: true, text: result.text, provider: 'openai' };
		}
		if (preference === 'openai') {
			return { ok: false, error: result.error, provider: 'openai' };
		}
		console.warn(`[image-ocr] OpenAI failed (${result.error}), falling back to Workers AI.`);
	}

	return runWorkersFallback(env, input, promptOverride);
}

async function runWorkersFallback(
	env: Env,
	input: { imageBytes: Uint8Array; mimeType: string },
	promptOverride?: { system: string; user: string }
): Promise<ImageDocumentOcrResult> {
	const visionResult = await runWorkersVisionOcr(env, { imageBytes: input.imageBytes, mimeType: input.mimeType }, promptOverride);
	if (visionResult.ok) {
		return { ok: true, text: visionResult.text, provider: 'workers_ai' };
	}
	return { ok: false, error: visionResult.error, provider: 'workers_ai' };
}
