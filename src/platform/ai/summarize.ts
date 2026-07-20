/**
 * Document summarization over already-extracted raw text.
 *
 * Reuses the shared LLM provider (`callAiJsonWithSource`: Workers AI → external
 * HTTP LLM → none), asking for a small JSON object so the same fallback +
 * loose-JSON parsing the rest of the app relies on applies here too. Returns a
 * plain summary string (empty when no provider produced one).
 */
import { callAiJsonWithSource, type AiProviderUsed } from './json-provider';

/** Hard cap on how much text is sent to the model (keeps within context + cost). */
const MAX_INPUT_CHARS = 24_000;

const SYSTEM_PROMPT = `You summarize a business document (e.g. contract, quotation, purchase order, invoice, report) for a busy reader.
Return ONLY a JSON object: { "summary": string }.
Rules:
- Write the summary in the document's own primary language (Chinese doc → Chinese summary; English → English).
- 3–6 sentences. Lead with the document type + the parties involved, then key figures (amounts, dates, terms) and the purpose/scope.
- Only use facts present in the text. Do not invent numbers, names, or dates. If the text is too garbled to summarize, set summary to a short note saying so.`;

export interface SummarizeResult {
	summary: string;
	provider: AiProviderUsed;
}

/** Summarize document text into a short natural-language summary. */
export async function summarizeDocumentText(env: Env, rawText: string): Promise<SummarizeResult> {
	const text = rawText.trim();
	if (!text) return { summary: '', provider: 'none' };

	const clipped = text.length > MAX_INPUT_CHARS ? `${text.slice(0, MAX_INPUT_CHARS)}\n…[truncated]` : text;
	const { json, provider } = await callAiJsonWithSource(env, {
		system: SYSTEM_PROMPT,
		user: clipped
	});

	const summary =
		json && typeof json === 'object' && !Array.isArray(json)
			? String((json as Record<string, unknown>).summary ?? '').trim()
			: '';

	return { summary, provider };
}
