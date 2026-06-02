export type WorkersVisionOcrResult =
	| { ok: true; text: string; model: string; hadRepetition?: boolean }
	| { ok: false; error: string };

function readEnv(platformEnv: Env, key: string): string {
	const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
	const fromPlatform = (platformEnv as unknown as Record<string, unknown>)[key];
	if (typeof fromPlatform === 'string' && fromPlatform.trim()) return fromPlatform.trim();
	const fromProcess = processEnv?.[key];
	return typeof fromProcess === 'string' ? fromProcess.trim() : '';
}

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

function uint8ToBase64(bytes: Uint8Array): string {
	const chunk = 8192;
	let binary = '';
	for (let i = 0; i < bytes.length; i += chunk) {
		const sub = bytes.subarray(i, i + chunk);
		for (let j = 0; j < sub.length; j += 1) {
			binary += String.fromCharCode(sub[j]!);
		}
	}
	return btoa(binary);
}

function normalizeMime(mime: string): string {
	const m = mime.toLowerCase().trim();
	if (m === 'image/jpg') return 'image/jpeg';
	if (m.startsWith('image/')) return m;
	return 'image/jpeg';
}

function extractVisionText(raw: unknown): string {
	if (raw === null || raw === undefined) return '';
	if (typeof raw === 'string') return raw;
	if (typeof raw !== 'object') return '';

	const o = raw as Record<string, unknown>;
	if (typeof o.response === 'string') return o.response;
	if (typeof o.result === 'string') return o.result;
	if (typeof o.output === 'string') return o.output;
	if (typeof o.output_text === 'string') return o.output_text;
	if (typeof o.text === 'string') return o.text;

	if (o.result && typeof o.result === 'object' && !Array.isArray(o.result)) {
		const r = o.result as Record<string, unknown>;
		if (typeof r.response === 'string') return r.response;
		if (typeof r.text === 'string') return r.text;
	}

	const choices = o.choices as Array<{ message?: { content?: unknown } }> | undefined;
	const content = choices?.[0]?.message?.content;
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.map((p) => (typeof p === 'object' && p && 'text' in p ? String((p as { text?: string }).text ?? '') : ''))
			.filter(Boolean)
			.join('\n');
	}

	return '';
}

const SYSTEM_PROMPT = `You are an OCR engine for business and finance documents (invoices, contracts, POs, quotations).
Transcribe ALL visible text in natural reading order. Output each piece of information EXACTLY ONCE.
Rules:
- Output plain text only. No markdown, no bold, no preamble, no "Here is the text".
- Preserve line breaks where they separate distinct lines or table rows.
- Include numbers, dates, amounts, tax IDs, addresses, and table cells as they appear.
- NEVER repeat lines or sections. Each header, address, and line item appears only once.
- If the image is unreadable or not a document, output a single line: [UNREADABLE]
- Stop immediately after transcribing the last visible text on the page.`;

const USER_PROMPT =
	'Transcribe every legible word, digit, and symbol from this document image exactly once. Do not repeat any section. Use the same language(s) as printed on the page. Stop after the last line of the document.';

/**
 * Detect and remove repetitive text patterns produced by LLM vision models.
 * Returns the deduplicated text and a flag indicating whether heavy repetition
 * was found (which should lower confidence).
 */
function deduplicateVisionText(raw: string): { text: string; hadRepetition: boolean } {
	const lines = raw.split('\n');
	if (lines.length < 6) return { text: raw, hadRepetition: false };

	// Strategy 1: detect repeating line-blocks starting from the beginning
	// (e.g. the same 1-4 line pattern appearing many times).
	for (let blockSize = 1; blockSize <= 4; blockSize++) {
		if (lines.length < blockSize * 3) continue;
		const firstBlock = lines.slice(0, blockSize).join('\n');
		let repeatCount = 1;
		for (let i = blockSize; i + blockSize <= lines.length; i += blockSize) {
			const nextBlock = lines.slice(i, i + blockSize).join('\n');
			if (nextBlock === firstBlock) repeatCount++;
			else break;
		}
		if (repeatCount >= 4) {
			const uniqueLines: string[] = [...lines.slice(0, blockSize)];
			const seen = new Set<string>([firstBlock]);
			for (let i = blockSize; i < lines.length; i += blockSize) {
				const block = lines.slice(i, Math.min(i + blockSize, lines.length)).join('\n');
				if (!seen.has(block)) {
					seen.add(block);
					uniqueLines.push(...lines.slice(i, Math.min(i + blockSize, lines.length)));
				}
			}
			return { text: uniqueLines.join('\n').trim(), hadRepetition: true };
		}
	}

	// Strategy 2: sliding-window line-block repetition detection — catches
	// repeating blocks that start after a unique preamble (e.g. 3 unique
	// header lines, then the same 2-line block repeating 50 times).
	for (let blockSize = 1; blockSize <= 4; blockSize++) {
		for (let start = 1; start <= Math.min(10, lines.length - blockSize * 4); start++) {
			const block = lines.slice(start, start + blockSize).join('\n');
			let reps = 1;
			for (let j = start + blockSize; j + blockSize <= lines.length; j += blockSize) {
				if (lines.slice(j, j + blockSize).join('\n') === block) reps++;
				else break;
			}
			if (reps >= 4) {
				const unique = lines.slice(0, start + blockSize);
				return { text: unique.join('\n').trim(), hadRepetition: true };
			}
		}
	}

	// Strategy 3: substring-level repetition (a 20-200 char pattern
	// appearing 5+ times anywhere in the text).
	const totalLen = raw.length;
	for (let patLen = 20; patLen <= Math.min(200, totalLen / 4); patLen += 10) {
		const pat = raw.slice(0, patLen);
		let count = 0;
		let pos = 0;
		while (pos < totalLen) {
			const idx = raw.indexOf(pat, pos);
			if (idx === -1) break;
			count++;
			pos = idx + patLen;
		}
		if (count >= 5) {
			const secondOccurrence = raw.indexOf(pat, patLen);
			if (secondOccurrence > 0) {
				const uniquePart = raw.slice(0, secondOccurrence).trim();
				if (uniquePart.length > 20) {
					return { text: uniquePart, hadRepetition: true };
				}
			}
		}
	}

	return { text: raw, hadRepetition: false };
}

const DEFAULT_PRIMARY_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const DEFAULT_FALLBACK_MODEL = '';

async function callVisionModel(
	env: Env,
	modelId: string,
	messages: unknown[],
	maxTokens: number
): Promise<{ raw: unknown; model: string }> {
	const runOnce = () =>
		env.AI!.run(modelId as Parameters<NonNullable<Env['AI']>['run']>[0], {
			messages,
			max_tokens: maxTokens,
			temperature: 0.1
		} as Parameters<NonNullable<Env['AI']>['run']>[1]);

	try {
		const raw = await runOnce();
		return { raw, model: modelId };
	} catch {
		// Llama 3.2 Vision requires a one-time Meta license acknowledgement
		if (modelId.includes('llama')) {
			try {
				await env.AI!.run(modelId as Parameters<NonNullable<Env['AI']>['run']>[0], {
					prompt: 'agree'
				} as Parameters<NonNullable<Env['AI']>['run']>[1]);
			} catch { /* already agreed or unrelated */ }
			const raw = await runOnce();
			return { raw, model: modelId };
		}
		throw new Error(`Vision model ${modelId} call failed.`);
	}
}

export async function runWorkersVisionOcr(
	env: Env,
	input: { imageBytes: Uint8Array; mimeType: string }
): Promise<WorkersVisionOcrResult> {
	if (!env.AI) {
		return { ok: false, error: 'Workers AI is not available (missing AI binding).' };
	}
	if (input.imageBytes.length === 0) {
		return { ok: false, error: 'Empty image payload.' };
	}
	if (input.imageBytes.length > MAX_IMAGE_BYTES) {
		return { ok: false, error: `Image too large (${input.imageBytes.length} bytes, max ${MAX_IMAGE_BYTES}).` };
	}

	const envModel = readEnv(env, 'WORKERS_AI_VISION_MODEL');
	const primaryModel = envModel || DEFAULT_PRIMARY_MODEL;
	const fallbackModel = (!envModel && DEFAULT_FALLBACK_MODEL) ? DEFAULT_FALLBACK_MODEL : null;

	const mime = normalizeMime(input.mimeType);
	const dataUri = `data:${mime};base64,${uint8ToBase64(input.imageBytes)}`;

	const messages = [
		{ role: 'system' as const, content: SYSTEM_PROMPT },
		{
			role: 'user' as const,
			content: [
				{ type: 'text' as const, text: USER_PROMPT },
				{ type: 'image_url' as const, image_url: { url: dataUri } }
			]
		}
	];

	const tryExtract = async (modelId: string): Promise<WorkersVisionOcrResult> => {
		const { raw, model } = await callVisionModel(env, modelId, messages, 2048);
		const rawText = extractVisionText(raw).trim();
		if (!rawText || rawText === '[UNREADABLE]') {
			return { ok: false, error: `Vision model ${model} returned no usable text.` };
		}
		const { text, hadRepetition } = deduplicateVisionText(rawText);
		if (!text || text.length < 10) {
			return { ok: false, error: `Vision model ${model} output was entirely repetitive.` };
		}
		return { ok: true, text, model, hadRepetition };
	};

	try {
		const primaryResult = await tryExtract(primaryModel);
		if (primaryResult.ok) return primaryResult;

		if (fallbackModel && fallbackModel !== primaryModel) {
			try {
				const fallbackResult = await tryExtract(fallbackModel);
				return fallbackResult;
			} catch {
				return primaryResult;
			}
		}
		return primaryResult;
	} catch (e) {
		// Primary model threw — try fallback before giving up.
		if (fallbackModel && fallbackModel !== primaryModel) {
			try {
				return await tryExtract(fallbackModel);
			} catch { /* fallback also failed */ }
		}
		return { ok: false, error: e instanceof Error ? e.message : 'Workers AI vision call failed.' };
	}
}
