import { callAiJsonWithSource } from '$platform/ai/json-provider';
import {
	CATEGORY_DEFAULTS,
	CATEGORY_LABELS,
	CATEGORY_METADATA_FIELDS,
	inferExpenseCurrencyFromText,
	normalizeExpenseCurrency,
	type ExpenseCategory,
	type ExpenseDocType,
	type ExpenseType
} from '$modules/finance/domain/expense-upload';

type DetectionFieldType = 'text' | 'number' | 'date' | 'boolean';
type DetectionFieldSource = 'ocr' | 'llm' | 'user';

export type DetectionContext = {
	expenseType: ExpenseType;
	category: ExpenseCategory;
	docType: ExpenseDocType | null;
};

export type FieldSpec = {
	key: string;
	label: string;
	type: DetectionFieldType;
	isMetadata: boolean;
	source: DetectionFieldSource;
};

export type DetectionResult = {
	suggestions: {
		amount: number | null;
		currency: string | null;
		expenseDate: string | null;
		vendorOrSupplier: string | null;
		gstAmount: number | null;
		staffName: string | null;
		destination: string | null;
	};
	metadataHints: Record<string, string>;
	confidence: number | null;
	provider: 'workers_ai' | 'external_api' | 'heuristic' | 'none';
	extracted: Record<string, unknown>;
	fieldSpecs: FieldSpec[];
};

type OcrLikeExtract = {
	/** From {@link runOcrPipeline} first pass â€?issue / transaction date, any voucher type */
	documentDate: string | null;
	totalAmount: number | null;
	currency: string | null;
	supplierName: string | null;
	gstAmount: number | null;
	poNumber: string | null;
	dueDate: string | null;
	confidence: number;
	rawText: string;
};

const CORE_SPECS: FieldSpec[] = [
	{ key: 'amount', label: 'Amount', type: 'number', isMetadata: false, source: 'ocr' },
	{ key: 'currency', label: 'Currency', type: 'text', isMetadata: false, source: 'ocr' },
	{ key: 'expenseDate', label: 'Date', type: 'date', isMetadata: false, source: 'ocr' },
	{ key: 'vendorOrSupplier', label: 'Vendor/Supplier', type: 'text', isMetadata: false, source: 'ocr' },
	{ key: 'gstAmount', label: 'GST Amount', type: 'number', isMetadata: false, source: 'ocr' }
];

function toNumberOrNull(v: unknown): number | null {
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	if (typeof v === 'string' && v.trim()) {
		const n = Number(v.trim().replace(/,/g, ''));
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

function toDateOrNull(v: unknown): string | null {
	if (typeof v !== 'string' || !v.trim()) return null;
	const t = v.trim();
	const iso = t.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
	if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
	const dmy = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
	if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
	return null;
}

function toTextOrNull(v: unknown): string | null {
	return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function isValidYmd(y: number, m: number, d: number): boolean {
	if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return false;
	const dt = new Date(Date.UTC(y, m - 1, d));
	return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isoFromYmd(y: number, m: number, d: number): string {
	return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Score date mentions in OCR text by surrounding context to disambiguate (prefer document/order dates over due/delivery dates). */
type ScoredDateHint = { iso: string; score: number; raw: string; window: string };

function scoreDateWindow(ctx: string, docType: ExpenseDocType | null): number {
	const c = ctx.toLowerCase().replace(/\s+/g, ' ');
	let s = 0;
	if (
		/(invoice|order|document|purchase)\s*date|(^|\s)date\s*[:#]|issue\s*date|order\s*date|po\s*date|printed|dated(\s|$)/i.test(
			c
		)
	) {
		s += 52;
	}
	if (/\bpo\b|purchase\s*order|quotation|line\s*item|description|qty|quantity|u\.?m\.?|unit\s*price/i.test(c)) {
		s += 22;
	}
	if (/\btotal\b|\bamount\b|subtotal|grand\s*total|tax\b|gst\b/i.test(c)) {
		s += 14;
	}
	if (docType === 'po' || docType === 'invoice' || docType === 'receipt') {
		if (/\binvoice\b|\breceipt\b|\bpo\b/i.test(c)) s += 10;
	}
	if (
		/due\s*date|payment\s*due|pay\s*(by|before)|delivery\s*date|ship(ping)?\s*date|valid\s*(until|to|from)|expir(y|es)|promo(tion)?/i.test(
			c
		)
	) {
		s -= 48;
	}
	return s;
}

function collectScoredDatesFromText(text: string, docType: ExpenseDocType | null): ScoredDateHint[] {
	const hints: ScoredDateHint[] = [];
	const seenAt = new Set<string>();

	const pushHint = (iso: string, start: number, len: number, raw: string): void => {
		const key = `${iso}@${start}`;
		if (seenAt.has(key)) return;
		seenAt.add(key);
		const window = text.slice(Math.max(0, start - 160), Math.min(text.length, start + len + 160));
		const score = scoreDateWindow(window, docType);
		hints.push({ iso, score, raw, window: window.replace(/\s+/g, ' ').slice(0, 200) });
	};

	let m: RegExpExecArray | null;

	const reIso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
	while ((m = reIso.exec(text)) !== null) {
		const y = +m[1];
		const mo = +m[2];
		const d = +m[3];
		if (isValidYmd(y, mo, d)) pushHint(isoFromYmd(y, mo, d), m.index, m[0].length, m[0]);
	}

	const reDmy = /\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g;
	while ((m = reDmy.exec(text)) !== null) {
		const a = +m[1];
		const b = +m[2];
		const y = +m[3];
		let mo = b;
		let d = a;
		if (a > 12 && b <= 12) {
			d = a;
			mo = b;
		} else if (b > 12 && a <= 12) {
			d = b;
			mo = a;
		} else if (a <= 12 && b <= 12) {
			// Common SG/EU: day.month.year
			d = a;
			mo = b;
		}
		if (isValidYmd(y, mo, d)) pushHint(isoFromYmd(y, mo, d), m.index, m[0].length, m[0]);
	}

	const reDmyDash = /\b(\d{1,2})-(\d{1,2})-(\d{4})\b/g;
	while ((m = reDmyDash.exec(text)) !== null) {
		const a = +m[1];
		const b = +m[2];
		const y = +m[3];
		let mo = b;
		let d = a;
		if (a > 12 && b <= 12) {
			d = a;
			mo = b;
		} else if (b > 12 && a <= 12) {
			d = b;
			mo = a;
		} else if (a <= 12 && b <= 12) {
			d = a;
			mo = b;
		}
		if (isValidYmd(y, mo, d)) pushHint(isoFromYmd(y, mo, d), m.index, m[0].length, m[0]);
	}

	const isoCounts = new Map<string, number>();
	for (const h of hints) {
		isoCounts.set(h.iso, (isoCounts.get(h.iso) ?? 0) + 1);
	}
	const byIso = new Map<string, ScoredDateHint>();
	for (const h of hints) {
		const cur = byIso.get(h.iso);
		if (!cur || h.score > cur.score) {
			byIso.set(h.iso, { ...h });
		}
	}
	const merged = [...byIso.values()];
	for (const h of merged) {
		const c = isoCounts.get(h.iso) ?? 1;
		if (c > 1) {
			h.score += Math.min(28, (c - 1) * 7);
		}
	}
	return merged.sort((a, b) => b.score - a.score);
}

function formatDateCandidatesForPrompt(ranked: ScoredDateHint[]): string {
	if (ranked.length === 0) return '';
	const lines = ranked.slice(0, 8).map((h, i) => {
		return `${i + 1}. ${h.iso} (contextScore=${h.score}, asPrinted="${h.raw}") â€?â€?{h.window}â€¦`;
	});
	return (
		`\n\n---\nDATE_CANDIDATES (ranked by contextual relevance; expenseDate should match the document/invoice/order date, not due/delivery/valid-until):\n` +
		`${lines.join('\n')}\n---\n`
	);
}

function resolveExpenseDate(
	llmDate: string | null,
	ocrFallback: string | null,
	ranked: ScoredDateHint[]
): string | null {
	if (ranked.length === 0) {
		return llmDate ?? ocrFallback ?? null;
	}
	const top = ranked[0]!;
	const second = ranked[1];
	const margin = second ? top.score - second.score : 999;
	const strongHeuristic = top.score >= 48 && margin >= 10;
	if (strongHeuristic) {
		if (llmDate && llmDate !== top.iso) {
			const llmRank = ranked.findIndex((h) => h.iso === llmDate);
			if (llmRank === -1 || (llmRank > 0 && ranked[llmRank]!.score < top.score - 15)) {
				return top.iso;
			}
		}
		return top.iso;
	}
	if (llmDate) return llmDate;
	return top.iso ?? ocrFallback ?? null;
}

function buildFieldSpecs(ctx: DetectionContext): FieldSpec[] {
	const metadataSpecs: FieldSpec[] = (CATEGORY_METADATA_FIELDS[ctx.category] ?? []).map((f) => ({
		key: f.key,
		label: f.label,
		type: f.type,
		isMetadata: true,
		source: f.source
	}));
	return [...CORE_SPECS, ...metadataSpecs];
}

function buildExpenseDetectPrompt(ctx: DetectionContext, fields: FieldSpec[]): string {
	const lines = fields.map((f) => {
		const where = f.isMetadata ? 'metadata' : 'suggestions';
		return `- ${where}.${f.key} (${f.type}) // ${f.label}`;
	});
	const defaults = CATEGORY_DEFAULTS[ctx.category];

	return `You extract expense fields from OCR text for SmartFin.
Return ONLY JSON with this exact shape:
{
  "suggestions": {
    "amount": number|null,
    "currency": string|null,
    "expenseDate": "YYYY-MM-DD"|null,
    "vendorOrSupplier": string|null,
    "gstAmount": number|null,
    "staffName": string|null,
    "destination": string|null
  },
  "metadataHints": { "key": "value", ... },
  "confidence": number
}

Business context:
- expenseType: ${ctx.expenseType}
- category: ${ctx.category} (${CATEGORY_LABELS[ctx.category] ?? ctx.category})
- docType: ${ctx.docType ?? 'none'}
- default reimbursement: ${defaults.reimbursement}
- default businessTrip: ${defaults.businessTrip}

Extract target fields:
${lines.join('\n')}

Rules:
- Use null for unknown suggestions.
- metadataHints must include only metadata keys from target fields.
- Do not invent values. Infer carefully from OCR text.
- Keep dates in YYYY-MM-DD.
- confidence range: 0-100.

currency (enumeration â€?critical for form binding):
- suggestions.currency MUST be exactly one of: SGD, USD, CNY, MYR, EUR (ISO 4217 three-letter codes only).
- NEVER output currency symbols alone as the value: do not use "Â¥", "ï¿?, "$", "â‚?, "S$", "US$", "RM" as the final currency string.
- Map from document text: Â¥ or ï¿?or RMB or explicit CNY â†?CNY; S$ or SG$ â†?SGD; US$ or USD â†?USD; â‚?â†?EUR; RM â†?MYR.
- If the document shows an amount with Â¥ nearby, choose CNY unless the text explicitly states another currency.

expenseDate (critical):
- This is the DOCUMENT / transaction date on this PO, invoice, or receipt â€?when the expense was incurred or the document was issued.
- If OCR text contains MULTIPLE dates, you MUST choose the one tied to the document itself (often repeated on line items, near "Date:", "Order date", or the same date column in a table).
- Do NOT use: due date, payment due, delivery date, shipping date, promotion valid-until, expiry, or unrelated historical dates in boilerplate.
- If a block labeled DATE_CANDIDATES appears at the end, treat it as ranked hints: prefer the top candidate unless the OCR clearly shows a different document date.
`;
}

function normalizeDetectionOutput(
	ctx: DetectionContext,
	ocr: OcrLikeExtract,
	fieldSpecs: FieldSpec[],
	llmRaw: unknown,
	provider: DetectionResult['provider']
): DetectionResult {
	const llmObj =
		llmRaw && typeof llmRaw === 'object' && !Array.isArray(llmRaw)
			? (llmRaw as Record<string, unknown>)
			: null;
	const llmSuggestions =
		llmObj?.suggestions && typeof llmObj.suggestions === 'object' && !Array.isArray(llmObj.suggestions)
			? (llmObj.suggestions as Record<string, unknown>)
			: {};
	const llmMeta =
		llmObj?.metadataHints && typeof llmObj.metadataHints === 'object' && !Array.isArray(llmObj.metadataHints)
			? (llmObj.metadataHints as Record<string, unknown>)
			: {};

	const rankedDates = collectScoredDatesFromText(ocr.rawText || '', ctx.docType);
	const llmExpenseDate = toDateOrNull(llmSuggestions.expenseDate);

	const rawCurrency =
		toTextOrNull(llmSuggestions.currency) ?? (ocr.currency ? String(ocr.currency).trim() : null);
	let currencyNorm = normalizeExpenseCurrency(rawCurrency);
	if (!currencyNorm) {
		currencyNorm = inferExpenseCurrencyFromText(ocr.rawText || '');
	}

	const suggestions: DetectionResult['suggestions'] = {
		amount: toNumberOrNull(llmSuggestions.amount) ?? ocr.totalAmount ?? null,
		currency: currencyNorm,
		expenseDate: resolveExpenseDate(llmExpenseDate, ocr.documentDate ?? null, rankedDates),
		vendorOrSupplier: toTextOrNull(llmSuggestions.vendorOrSupplier) ?? ocr.supplierName ?? null,
		gstAmount: toNumberOrNull(llmSuggestions.gstAmount) ?? ocr.gstAmount ?? null,
		staffName: toTextOrNull(llmSuggestions.staffName),
		destination: toTextOrNull(llmSuggestions.destination)
	};

	const metadataKeys = new Set(fieldSpecs.filter((f) => f.isMetadata).map((f) => f.key));
	const metadataHints: Record<string, string> = {};

	for (const [k, v] of Object.entries(llmMeta)) {
		if (!metadataKeys.has(k)) continue;
		if (v == null) continue;
		if (typeof v === 'number' || typeof v === 'boolean') {
			metadataHints[k] = String(v);
		} else if (typeof v === 'string' && v.trim()) {
			metadataHints[k] = v.trim();
		}
	}

	if (ctx.category === 'purchase' && ocr.poNumber && !metadataHints.po_number) {
		metadataHints.po_number = ocr.poNumber;
	}
	if ((ctx.category === 'invoice' || ctx.category === 'ai_subscription') && ocr.dueDate && !metadataHints.due_date) {
		metadataHints.due_date = ocr.dueDate;
	}

	const llmConfidence = toNumberOrNull(llmObj?.confidence);
	const confidence = llmConfidence ?? Math.round((ocr.confidence ?? 0) * 100);

	return {
		suggestions,
		metadataHints,
		confidence,
		provider,
		extracted: llmObj ?? {},
		fieldSpecs
	};
}

export async function detectExpenseFieldsFromOcr(
	ctx: DetectionContext,
	ocr: OcrLikeExtract,
	env: Env
): Promise<DetectionResult> {
	const fieldSpecs = buildFieldSpecs(ctx);
	const promptVersion = (env.OCR_PROMPT_VERSION || 'v1').trim() || 'v1';
	const system = buildExpenseDetectPrompt(ctx, fieldSpecs);
	const rankedForPrompt = collectScoredDatesFromText(ocr.rawText || '', ctx.docType);
	const userPayload = (ocr.rawText || '') + formatDateCandidatesForPrompt(rankedForPrompt);

	const { json, provider } = await callAiJsonWithSource(env, {
		system,
		user: userPayload,
		promptVersion
	});

	const normalizedProvider: DetectionResult['provider'] =
		provider === 'workers_ai' || provider === 'external_api' ? provider : 'none';

	return normalizeDetectionOutput(ctx, ocr, fieldSpecs, json, normalizedProvider);
}
