import { inferExpenseCurrencyFromText } from '$modules/finance/domain/expense-upload';
import { callAiJsonWithSource, type AiProviderUsed } from '$platform/ai/json-provider';

/** Core shape produced by the OCR pipeline's lightweight LLM / heuristic pass (any voucher type). */
export type DocumentFieldsCore = {
	documentDate: string | null;
	totalAmount: number | null;
	currency: string | null;
	supplierName: string | null;
	gstAmount: number | null;
	poNumber: string | null;
	dueDate: string | null;
};

export type DocumentFieldsExtraction = DocumentFieldsCore & {
	llmProvider: 'heuristic' | 'external_api' | 'workers_ai';
	modelResponseRaw?: string;
};

type LlmExtractOptions = {
	llmProvider: 'heuristic' | 'external';
	llmApiUrl?: string;
	llmApiKey?: string;
	promptVersion: string;
	env?: Env;
};

function pickCurrency(text: string): string | null {
	const match = text.match(/\b(SGD|USD|CNY|MYR|EUR)\b/i);
	if (match) return match[1].toUpperCase();
	return inferExpenseCurrencyFromText(text);
}

function pickNumber(text: string, pattern: RegExp): number | null {
	const match = text.match(pattern);
	if (!match?.[1]) return null;
	const normalized = match[1].replace(/,/g, '');
	const parsed = Number.parseFloat(normalized);
	return Number.isFinite(parsed) ? parsed : null;
}

function pickDate(text: string, pattern: RegExp): string | null {
	const match = text.match(pattern);
	return match?.[1] ?? null;
}

function pickParsedString(parsed: Record<string, unknown>, ...keys: string[]): string | null {
	for (const k of keys) {
		const v = parsed[k];
		if (typeof v === 'string' && v.trim()) return v.trim();
	}
	return null;
}

function heuristicExtract(rawText: string): DocumentFieldsExtraction {
	const fromInvoiceLabel = pickDate(rawText, /invoice\s*date[:\s]+(\d{4}-\d{2}-\d{2})/i);
	const documentDate = fromInvoiceLabel;
	const dueDate = pickDate(rawText, /due\s*date[:\s]+(\d{4}-\d{2}-\d{2})/i);
	const totalAmount = pickNumber(rawText, /(?:total|amount\s*due)[:\s$]+([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
	const gstAmount = pickNumber(rawText, /(?:gst|tax)\s*(?:amount)?[:\s$]+([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
	const supplierNameMatch = rawText.match(/supplier[:\s]+([^\n]+)/i);
	const poMatch = rawText.match(/po(?:\s*number)?[:\s#-]+([A-Z0-9-]+)/i);

	return {
		documentDate,
		totalAmount,
		currency: pickCurrency(rawText),
		supplierName: supplierNameMatch?.[1]?.trim() ?? null,
		gstAmount,
		poNumber: poMatch?.[1] ?? null,
		dueDate,
		llmProvider: 'heuristic'
	};
}

async function externalExtract(
	rawText: string,
	options: LlmExtractOptions
): Promise<DocumentFieldsExtraction | null> {
	const envLike = {
		LLM_PROVIDER: options.llmProvider,
		LLM_API_URL: options.llmApiUrl,
		LLM_API_KEY: options.llmApiKey,
		OCR_PROMPT_VERSION: options.promptVersion
	} as Env;
	const envForCall = options.env ?? envLike;

	const systemPrompt = `You extract structured fields from business document OCR text (invoice, receipt, purchase order, etc.).
Return ONLY a JSON object with keys:
documentDate, totalAmount, currency, supplierName, gstAmount, poNumber, dueDate.
- documentDate: the document issue or transaction date (YYYY-MM-DD when possible), NOT the due date.
- supplierName: vendor / merchant / supplier name when shown.
Use null for unknown fields. Prefer ISO dates.`;
	const { json: parsedUnknown, provider } = await callAiJsonWithSource(envForCall, {
		system: systemPrompt,
		user: rawText,
		promptVersion: options.promptVersion
	});
	if (!parsedUnknown || typeof parsedUnknown !== 'object' || Array.isArray(parsedUnknown)) return null;
	const parsed = parsedUnknown as Record<string, unknown>;
	const llmProvider: Extract<DocumentFieldsExtraction['llmProvider'], AiProviderUsed> =
		provider === 'workers_ai' ? 'workers_ai' : 'external_api';

	return {
		documentDate: pickParsedString(parsed, 'documentDate', 'invoiceDate'),
		totalAmount: typeof parsed.totalAmount === 'number' ? parsed.totalAmount : null,
		currency: typeof parsed.currency === 'string' ? parsed.currency : null,
		supplierName: typeof parsed.supplierName === 'string' ? parsed.supplierName : null,
		gstAmount: typeof parsed.gstAmount === 'number' ? parsed.gstAmount : null,
		poNumber: typeof parsed.poNumber === 'string' ? parsed.poNumber : null,
		dueDate: typeof parsed.dueDate === 'string' ? parsed.dueDate : null,
		llmProvider,
		modelResponseRaw: JSON.stringify(parsed)
	};
}

/**
 * First structured pass on raw OCR text inside {@link runOcrPipeline}.
 * Names reflect generic vouchers; expense category is applied later (e.g. `detectExpenseFieldsFromOcr`).
 */
export async function extractStructuredDocumentFields(
	rawText: string,
	options: LlmExtractOptions
): Promise<DocumentFieldsExtraction> {
	if (options.llmProvider === 'external' || options.env?.AI) {
		const external = await externalExtract(rawText, options);
		if (external) return external;
	}
	return heuristicExtract(rawText);
}
