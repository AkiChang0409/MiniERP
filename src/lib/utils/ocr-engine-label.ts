/**
 * Map a processed artifact's text-extraction provenance to a short, human
 * label of which engine actually transcribed it. Lets the user compare the
 * two image OCR routes (Vision AI vs OCR.space) at a glance in the inbox.
 *
 * Source of truth is `textExtraction.provider` / `.method` (set by
 * `src/platform/ai/text-extraction.ts`) — i.e. what was ACTUALLY used, not the
 * route the user requested (which can fall back, e.g. to mock in local dev).
 *
 * `tone` is a Tailwind ring/badge class set for the standalone inbox page; the
 * AI Panel (custom CSS) just uses `.label`.
 */
export interface OcrEngineBadge {
	label: string;
	tone: string;
}

export function ocrEngineBadge(
	textExtraction?: { method?: string; provider?: string } | null
): OcrEngineBadge | null {
	const provider = (textExtraction?.provider ?? '').toLowerCase();
	const method = (textExtraction?.method ?? '').toLowerCase();
	if (!provider && !method) return null;

	if (provider === 'ocr_space') {
		return { label: 'OCR.space', tone: 'bg-violet-50 text-violet-700 ring-violet-200' };
	}
	// Two vision sub-routes — keep them distinct so the user can compare the
	// external AI API vs Cloudflare Workers AI.
	if (provider === 'openai') {
		return { label: 'Vision · API', tone: 'bg-indigo-50 text-indigo-700 ring-indigo-200' };
	}
	if (provider === 'workers_ai') {
		return { label: 'Vision · Workers', tone: 'bg-teal-50 text-teal-700 ring-teal-200' };
	}
	if (method === 'vision_model') {
		return { label: 'Vision AI', tone: 'bg-indigo-50 text-indigo-700 ring-indigo-200' };
	}
	if (provider.startsWith('client_') || method === 'pdf_text' || provider === 'builtin_pdf_legacy') {
		return { label: 'PDF text', tone: 'bg-slate-50 text-slate-600 ring-slate-200' };
	}
	if (provider === 'docx_xml_parse') {
		return { label: 'Word', tone: 'bg-slate-50 text-slate-600 ring-slate-200' };
	}
	if (provider === 'eml_mime_parse') {
		return { label: 'Email', tone: 'bg-slate-50 text-slate-600 ring-slate-200' };
	}
	if (provider.startsWith('mock')) {
		return { label: 'Mock', tone: 'bg-amber-50 text-amber-700 ring-amber-200' };
	}
	return { label: provider || method, tone: 'bg-slate-50 text-slate-600 ring-slate-200' };
}
