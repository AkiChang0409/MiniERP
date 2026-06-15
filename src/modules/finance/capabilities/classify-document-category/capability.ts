/**
 * classify-document-category — category-first document classification.
 *
 * The single source of truth for "what kind of finance document is this" is
 * the finance **category** (the 15-entry catalog in `categories.ts`), because
 * that is what drives field-extraction prompts (`category.llmFields`) and
 * persistence (`category.persistTarget`).
 *
 * This capability is injected (inversion of control) into the document-intake
 * pipeline's `processDocument` as `categoryClassifier`, so document-intake
 * never imports finance directly. It REPLACES the old two-step path
 * (document-intake `classify-document` → coarse `documentType` →
 * `categoryIdForDocumentType` lossy map). The coarse `documentType` is now
 * derived from the chosen category purely for display.
 *
 * LLM-only: finance documents vary too much for keyword heuristics to be a
 * safe basis for routing + extraction. When there is no usable text or no
 * runtime env, returns null so the caller can fall back.
 */
import { z } from 'zod';
import { runStructuredOutput } from '../../../../platform/ai/ai-runtime';
import { normalizeDocumentText, smartTruncate } from '../../../../platform/ai/text-preprocessing';
import {
	FINANCE_CATEGORY_CATALOG,
	findCategoryById,
	documentTypeForCategory,
	type IntakeDocumentType
} from '../../workflows/financial-document-intake/categories';
import type { FinanceCapability, FinanceCapabilityContext } from '../types';
import { classifyDocumentCategoryInputSchema } from './schema';

export const CLASSIFY_DOCUMENT_CATEGORY_PROMPT_VERSION = 'classify-category-v1';
export const CLASSIFY_DOCUMENT_CATEGORY_SCHEMA_VERSION = 'classify-category-v1';

const MIN_TEXT_LENGTH = 16;
const TEXT_BUDGET = 6_000;

interface CapabilityContextWithEnv extends FinanceCapabilityContext {
	env?: Env;
}

export type ClassifyDocumentCategoryInput = z.infer<typeof classifyDocumentCategoryInputSchema>;

export interface ClassifyDocumentCategoryOutput {
	/** Chosen finance category id, or null when the LLM could not decide / no text. */
	categoryId: string | null;
	confidence: number;
	/** Coarse intake documentType derived from the category (display only). */
	documentType: IntakeDocumentType;
	/** Ranked alternatives as intake documentTypes (for the inbox suggestion chips). */
	possibleTypes: Array<{ documentType: IntakeDocumentType; confidence: number }>;
	/** Alternative category ids (richer than possibleTypes; primary first). */
	candidateCategoryIds: Array<{ categoryId: string; confidence: number }>;
	reason?: string;
}

const llmSchema = z.object({
	categoryId: z.string(),
	confidence: z.number().min(0).max(1),
	alternatives: z
		.array(
			z.object({
				categoryId: z.string(),
				confidence: z.number().min(0).max(1)
			})
		)
		.optional(),
	reasoning: z.string().optional()
});

function buildSystemPrompt(): string {
	const lines = FINANCE_CATEGORY_CATALOG.map((c) => {
		const bucket =
			c.bucket === 'expense' ? 'expense' : c.bucket === 'revenue' ? 'revenue' : 'archive-only';
		const sub = c.sublabel ? ` — ${c.sublabel}` : '';
		return `- ${c.id} (${bucket}): ${c.label}${sub}`;
	}).join('\n');

	return [
		'You classify a financial/business document into exactly one accounting category.',
		'Choose the single best category id from the list below. Base it on what the',
		'document IS (who issued it, to whom, what it represents), not just keywords.',
		'',
		'Categories:',
		lines,
		'',
		'IMPORTANT: OCR often DROPS the big title at the top of the page, so the',
		'word "Invoice" may be MISSING from the text. Classify by STRUCTURE, not',
		'just by finding the word. Recognise a commercial / customs invoice by its',
		'shape even with no "Invoice" title:',
		'  • a shipper / exporter / "Shipped By" AND a consignee / buyer / "Shipped To",',
		'  • itemised goods with quantity, unit price/value and a TOTAL value',
		'    (e.g. "Total USD 13.00"),',
		'  • HS / HSN / tariff codes (e.g. 2204.21.4000, 82055990), country of origin,',
		'  • customs / export declarations ("no commercial value", "for customs',
		'    purposes", "not for resale").',
		'  Such a document IS an invoice (commercial invoice), NOT a receipt and NOT',
		'  a logistics document.',
		'',
		'Decide by the DOCUMENT TYPE first, then by who issued it:',
		'- INVOICE — title says "Invoice" / "Commercial Invoice" / "Tax Invoice" OR',
		'  it has the commercial-invoice STRUCTURE above (exporter+consignee, priced',
		'  line items, a total value). It has an invoice number, line items, and a',
		'  payable TOTAL / "Amount Chargeable" / "Total Value". This is an invoice',
		'  EVEN IF it also describes shipping, freight, ports, customs, or "free',
		'  samples / no commercial value". Shipping/customs wording does NOT make it',
		'  a logistics document.',
		'    • issued by a SUPPLIER to us (we owe / it is a cost) → expense.sales_cost.invoice',
		'      (or a more specific expense.opex.* category if clearly opex).',
		'    • issued by US to a customer (they owe us) → revenue.invoice_out.',
		'- RECEIPT — a point-of-sale proof of PAYMENT (shop / restaurant / taxi /',
		'  fuel). Small, already paid, no buyer/seller invoice structure, no HSN',
		'  codes. → the matching expense.opex.* category. Do NOT label a B2B',
		'  commercial invoice as a receipt.',
		'- PURCHASE ORDER / CONTRACT / QUOTATION → the document_only.* categories',
		'  (these are agreements/orders, not a bill with a payable total).',
		'- A pure packing list / bill of lading / airway bill / delivery order with',
		'  NO payable total is a logistics document — but those map to no category',
		'  here, so only choose one if there is genuinely no invoice total present.',
		'',
		'Return JSON: { "categoryId": "<id from the list>", "confidence": 0..1,',
		'"alternatives": [{ "categoryId": "<id>", "confidence": 0..1 }], "reasoning": "<short>" }.',
		'Only use category ids exactly as listed. Pick your single best guess even if unsure',
		'(reflect uncertainty in a low confidence).'
	].join('\n');
}

function toPossibleTypes(
	candidates: Array<{ categoryId: string; confidence: number }>
): Array<{ documentType: IntakeDocumentType; confidence: number }> {
	const out: Array<{ documentType: IntakeDocumentType; confidence: number }> = [];
	const seen = new Set<IntakeDocumentType>();
	for (const c of candidates) {
		const dt = documentTypeForCategory(c.categoryId);
		if (seen.has(dt)) continue;
		seen.add(dt);
		out.push({ documentType: dt, confidence: c.confidence });
	}
	return out;
}

function emptyResult(): ClassifyDocumentCategoryOutput {
	return {
		categoryId: null,
		confidence: 0,
		documentType: 'unknown',
		possibleTypes: [],
		candidateCategoryIds: []
	};
}

export const classifyDocumentCategoryCapability: FinanceCapability<
	ClassifyDocumentCategoryInput,
	ClassifyDocumentCategoryOutput
> = {
	id: 'finance.classify-document-category',
	description: 'Classify a finance/archive document directly into its canonical accounting category.',
	riskLevel: 'R2',
	inputSchema: classifyDocumentCategoryInputSchema,

	async execute(input, ctx) {
		const ctxWithEnv = ctx as CapabilityContextWithEnv;
		const text = input.text ?? '';
		if (text.length < MIN_TEXT_LENGTH || !ctxWithEnv.env) {
			return emptyResult();
		}

		const processedText = smartTruncate(normalizeDocumentText(text), TEXT_BUDGET);

		const result = await runStructuredOutput<unknown>({
			task: 'finance.classifyDocumentCategory',
			messages: [
				{ role: 'system', content: buildSystemPrompt() },
				{ role: 'user', content: processedText }
			],
			schema: llmSchema,
			schemaName: 'finance_document_category',
			schemaVersion: CLASSIFY_DOCUMENT_CATEGORY_SCHEMA_VERSION,
			modelHint: { capability: 'fast_classification', priority: 'quality' },
			metadata: {
				tenantId: ctx.tenantId ?? 'default',
				userId: ctx.userId,
				capabilityId: 'finance.classify-document-category',
				promptVersion: CLASSIFY_DOCUMENT_CATEGORY_PROMPT_VERSION,
				schemaVersion: CLASSIFY_DOCUMENT_CATEGORY_SCHEMA_VERSION,
				riskLevel: 'R2',
				inputRefs: [`document:${input.documentId}`]
			},
			env: ctxWithEnv.env
		});

		if (result.status !== 'success') {
			console.warn(
				`[classify-document-category] LLM call failed for ${input.documentId}: status=${result.status} error=${result.error}`
			);
			return emptyResult();
		}

		const parsed = result.result.value as z.infer<typeof llmSchema>;

		// Validate against the real catalog; drop unknown ids the model invented.
		const primary = findCategoryById(parsed.categoryId);
		if (!primary) {
			console.warn(
				`[classify-document-category] model returned unknown categoryId="${parsed.categoryId}" for ${input.documentId}`
			);
			return { ...emptyResult(), reason: parsed.reasoning };
		}

		const candidateCategoryIds: Array<{ categoryId: string; confidence: number }> = [
			{ categoryId: primary.id, confidence: parsed.confidence }
		];
		for (const alt of parsed.alternatives ?? []) {
			if (alt.categoryId === primary.id) continue;
			if (!findCategoryById(alt.categoryId)) continue;
			if (candidateCategoryIds.some((c) => c.categoryId === alt.categoryId)) continue;
			candidateCategoryIds.push({ categoryId: alt.categoryId, confidence: alt.confidence });
		}

		return {
			categoryId: primary.id,
			confidence: parsed.confidence,
			documentType: documentTypeForCategory(primary.id),
			possibleTypes: toPossibleTypes(candidateCategoryIds),
			candidateCategoryIds,
			reason: parsed.reasoning
		};
	}
};
