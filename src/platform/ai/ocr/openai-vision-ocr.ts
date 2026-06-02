export type OpenAiVisionOcrResult =
	| { ok: true; text: string; model: string }
	| { ok: false; error: string };

function readEnv(platformEnv: Env, key: string): string {
	const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
	const fromPlatform = (platformEnv as unknown as Record<string, unknown>)[key];
	if (typeof fromPlatform === 'string' && fromPlatform.trim()) return fromPlatform.trim();
	const fromProcess = processEnv?.[key];
	return typeof fromProcess === 'string' ? fromProcess.trim() : '';
}

function uint8ToBase64(bytes: Uint8Array): string {
	const chunk = 8192;
	let binary = '';
	for (let i = 0; i < bytes.length; i += chunk) {
		const sub = bytes.subarray(i, i + chunk);
		for (let j = 0; j < sub.length; j++) binary += String.fromCharCode(sub[j]!);
	}
	return btoa(binary);
}

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const SYSTEM_PROMPT = [
	'You are a high-accuracy OCR engine for business and finance documents',
	'(invoices, packing lists, contracts, POs, quotations, receipts).',
	'',
	'CHARACTER-LEVEL ACCURACY IS THE TOP PRIORITY:',
	'- Transcribe every digit, decimal point, comma, hyphen, slash, currency',
	'  symbol, and unit suffix EXACTLY as printed. Do NOT round, normalize,',
	'  or "correct" values that look unusual.',
	'- Product codes, invoice numbers, tax IDs, GST numbers, phone numbers,',
	'  registration numbers, and postal codes must be reproduced byte-for-byte.',
	'  Treat O vs 0, I vs 1, S vs 5, B vs 8, Z vs 2 as distinct — if uncertain,',
	'  prefer the character that fits the surrounding pattern (e.g. all-digit',
	'  fields stay digit).',
	'- Preserve dimension/spec strings like "MSH3-15", "M2-0121882-9",',
	'  "WP01FAA13200" with their original hyphens and case.',
	'- Preserve decimal precision: "0.15" must NOT become "0.5" or "0.150".',
	'',
	'OUTPUT FORMAT:',
	'- Plain text only. No markdown, no bold, no preamble, no "Here is the text".',
	'- Preserve line breaks where they separate distinct rows / table lines.',
	'- For tables, output each row on its own line with cells separated by a',
	'  single space or tab; keep columns in natural reading order.',
	'- Output each piece of information EXACTLY ONCE. Never repeat a header,',
	'  address block, or line item.',
	'',
	'FAILURE MODE:',
	'- If the image is unreadable or not a document, output a single line:',
	'  [UNREADABLE]',
	'- Stop immediately after the last visible text on the page.'
].join('\n');

const USER_PROMPT = [
	'Transcribe every legible word, digit, and symbol from this document image',
	'exactly once, in reading order. Pay special attention to numeric values',
	'(quantities, unit prices, amounts, tax %, weights) and identifier strings',
	'(product codes, invoice numbers, tax / GST registration numbers).',
	'Reproduce them character-by-character — do not normalize or auto-correct.',
	'Use the same language(s) as printed. Stop after the last line.'
].join(' ');

export async function runOpenAiVisionOcr(
	env: Env,
	input: { imageBytes: Uint8Array; mimeType: string }
): Promise<OpenAiVisionOcrResult> {
	// Prefer the dedicated OPENAI_API_KEY; fall back to LLM_API_KEY so local dev
	// works without duplicating the same OpenAI key in .dev.vars.
	const apiKey = readEnv(env, 'OPENAI_API_KEY') || readEnv(env, 'LLM_API_KEY');
	if (!apiKey) {
		return { ok: false, error: 'OPENAI_API_KEY (or LLM_API_KEY) is not configured.' };
	}
	if (input.imageBytes.length === 0) {
		return { ok: false, error: 'Empty image payload.' };
	}
	if (input.imageBytes.length > MAX_IMAGE_BYTES) {
		return { ok: false, error: `Image too large (${input.imageBytes.length} bytes, max ${MAX_IMAGE_BYTES}).` };
	}

	const model = readEnv(env, 'OPENAI_VISION_MODEL') || DEFAULT_MODEL;
	const mimeType = input.mimeType.toLowerCase().startsWith('image/') ? input.mimeType : 'image/jpeg';
	const dataUri = `data:${mimeType};base64,${uint8ToBase64(input.imageBytes)}`;

	const body = {
		model,
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{
				role: 'user',
				content: [
					{ type: 'text', text: USER_PROMPT },
					// detail:"high" tiles the image at 512x512 native-resolution patches
					// (+ a low-res macro). Default "auto" silently downscales to 512x512
					// for typical sizes, which destroys digit accuracy on invoices.
					{ type: 'image_url', image_url: { url: dataUri, detail: 'high' } }
				]
			}
		],
		max_tokens: 4096,
		temperature: 0
	};

	let response: Response;
	try {
		response = await fetch(OPENAI_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`
			},
			body: JSON.stringify(body)
		});
	} catch (e) {
		return { ok: false, error: `OpenAI API unreachable: ${e instanceof Error ? e.message : String(e)}` };
	}

	let data: unknown;
	try {
		data = await response.json();
	} catch {
		return { ok: false, error: `OpenAI API returned non-JSON (status ${response.status}).` };
	}

	if (!response.ok) {
		const err = (data as Record<string, unknown>)?.error;
		const msg = typeof err === 'object' && err !== null
			? String((err as Record<string, unknown>).message ?? '')
			: String(err ?? '');
		return { ok: false, error: `OpenAI API error ${response.status}: ${msg || 'unknown'}` };
	}

	const text = extractOpenAiText(data);
	if (!text || text === '[UNREADABLE]') {
		return { ok: false, error: 'OpenAI returned no usable text.' };
	}

	return { ok: true, text, model };
}

function extractOpenAiText(data: unknown): string {
	if (!data || typeof data !== 'object') return '';
	const d = data as Record<string, unknown>;
	const choices = d.choices as Array<unknown> | undefined;
	if (!Array.isArray(choices) || choices.length === 0) return '';
	const first = choices[0] as Record<string, unknown>;
	const message = first.message as Record<string, unknown> | undefined;
	if (!message) return '';
	const content = message.content;
	if (typeof content === 'string') return content.trim();
	if (Array.isArray(content)) {
		return content
			.map((p) =>
				typeof p === 'object' && p !== null ? String((p as Record<string, unknown>).text ?? '') : ''
			)
			.join('\n')
			.trim();
	}
	return '';
}
