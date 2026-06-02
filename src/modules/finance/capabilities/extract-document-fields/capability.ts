/**
 * extract-document-fields — generalized document field extraction (Phase 3).
 *
 * Replaces the Phase-2 `finance.extract-invoice-fields` (which hard-coded the
 * supplier-invoice shape). The inbox path is intentionally LLM-only for real
 * extracted text: finance documents vary too much for regex extraction to be a
 * safe source of user-confirmable values.
 *
 * Output is category-field oriented for the Inbox pipeline: keys match the
 * selected category's `llmFields` (`invoice_number`, `vendor`,
 * `tracking_number`, etc.). Legacy workflow callers can request the old
 * common field projection via `outputShape: 'legacy'`.
 */
import type { ZodType } from 'zod';
import { runStructuredOutput } from '../../../../platform/ai/ai-runtime';
import { normalizeDocumentText, smartTruncate } from '../../../../platform/ai/text-preprocessing';
import {
	findCategoryById,
	type CategoryDefinition,
	type CategoryDocType
} from '../../workflows/financial-document-intake/categories';
import type { FinanceEvidence } from '../../agent/types';
import type { FinanceCapability, FinanceCapabilityContext } from '../types';
import {
	buildEvidence,
	pickFixture,
	type ExtractionProvider
} from '../extract-invoice-fields/mock';
import {
	contractSchemaV1,
	customerInvoiceSchemaV1,
	invoiceSchemaV1,
	poSchemaV1,
	quotationSchemaV1,
	receiptSchemaV1,
	EXTRACT_DOCUMENT_FIELDS_SCHEMA_VERSION,
	type ContractLlmV1,
	type CustomerInvoiceLlmV1,
	type InvoiceLlmV1,
	type PoLlmV1,
	type QuotationLlmV1,
	type ReceiptLlmV1
} from './schemas';
import {
	buildDocumentUserPrompt,
	CONTRACT_SYSTEM_PROMPT,
	CUSTOMER_INVOICE_SYSTEM_PROMPT,
	EXTRACT_DOCUMENT_FIELDS_PROMPT_VERSION,
	INVOICE_SYSTEM_PROMPT,
	PO_SYSTEM_PROMPT,
	QUOTATION_SYSTEM_PROMPT,
	RECEIPT_SYSTEM_PROMPT
} from './prompts';

const MIN_TEXT_LENGTH_FOR_REAL_EXTRACT = 32;

/**
 * Front-heavy truncation for POs and other documents where the critical
 * structured fields (PO number, vendor, buyer, date, items, totals) are
 * concentrated in the first few pages. The trailing pages are usually
 * boilerplate T&C that the LLM doesn't need for field extraction.
 *
 * Strategy: allocate the full budget to the beginning of the document.
 * If the first pass produces low confidence, the caller retries with a
 * larger budget or the full text (see LOW_CONFIDENCE_THRESHOLD below).
 */
function truncateFrontHeavy(text: string, budget: number): string {
	if (text.length <= budget) return text;
	return text.slice(0, budget) + '\n\n[... remainder truncated ...]';
}

interface CapabilityContextWithEnv extends FinanceCapabilityContext {
	env?: Env;
}

export interface ExtractDocumentFieldsInput {
	documentId: string;
	fileName?: string;
	text?: string;
	artifactConfidence?: number;
	/** Category id from the workflow state, e.g. `expense.sales_cost.invoice`.
	 *  When absent the capability defaults to invoice extraction (Phase 2 behavior). */
	categoryId?: string;
	/** Legacy finance workflow still expects documentNumber/counterpartyName. Inbox leaves this unset. */
	outputShape?: 'category' | 'legacy';
}

export interface ExtractDocumentFieldsOutput {
	fields: Record<string, unknown>;
	/** Overall document-level confidence. For LLM-mode this is the mean of per-field confidences
	 *  (across fields the LLM actually populated), falling back to the LLM's self-reported overall
	 *  confidence. Kept as a scalar for legacy callers that store one number per artifact. */
	confidence: number;
	/** Per-field confidence map, keyed by the same shape as `fields` (snake_case category keys for
	 *  `outputShape: 'category'`, camelCase legacy keys for `outputShape: 'legacy'`). Only includes
	 *  keys whose value is present and non-null. Worker/API routes write this straight into
	 *  `SuggestedFieldsResult.confidence` — no fan-out needed. */
	fieldConfidence: Record<string, number>;
	evidence: FinanceEvidence[];
	/** Verbatim text excerpts keyed by the LLM's camelCase field name (e.g. supplierName, totalAmount).
	 *  Used in the review UI to highlight the source sentence in the raw-text panel when the user
	 *  focuses a field. Only present when the LLM path was taken; undefined for mock/fixture runs. */
	sourceQuotes?: Record<string, string>;
	provider: ExtractionProvider;
}

type CommonFields = {
	documentNumber?: string | null;
	counterpartyName?: string | null;
	currency?: string | null;
	totalAmount?: number | null;
	gstAmount?: number | null;
	issueDate?: string | null;
	dueDate?: string | null;
	recipientName?: string | null;
	clientName?: string | null;
	description?: string | null;
	trackingNumber?: string | null;
	serviceName?: string | null;
	period?: string | null;
	destination?: string | null;
	subtotal?: number | null;
	poNumber?: string | null;
	paymentTerms?: string | null;
	validUntil?: string | null;
	lineItems?: Array<Record<string, unknown>> | null;
};

// ---------------------------------------------------------------------------
// LLM dispatch (per categoryDocType)
// ---------------------------------------------------------------------------

/** Per-field confidence keyed in the CommonFields shape — same key set as the projected fields,
 *  so downstream `projectForCategory` can run the same `categoryValue` reverse-map over both
 *  data and confidence in lockstep. Missing keys mean "LLM did not report confidence for that
 *  field" (or the field itself was null) — callers should fall back to the overall confidence. */
type CommonFieldConfidence = Partial<Record<keyof CommonFields, number>>;

interface MappedExtraction {
	fields: CommonFields;
	fieldConfidence: CommonFieldConfidence;
}

interface LlmConfig<T> {
	systemPrompt: string;
	schema: ZodType<T>;
	schemaName: string;
	mapToFields: (value: T) => MappedExtraction | null;
	confidenceFromValue: (value: T) => number | undefined;
}

function hasAnyExtractedValue(fields: CommonFields): boolean {
	return Object.values(fields).some((value) => {
		if (Array.isArray(value)) return value.length > 0;
		return value !== null && value !== undefined && value !== '';
	});
}

/** Read `_confidence` off an LLM raw value with type-safe defensive parsing.
 *  Returns an empty object when the LLM omitted the field or returned a bad shape;
 *  per-field consumers then fall back to the overall `confidence`. */
function readLlmFieldConfidence(raw: unknown): Record<string, number> {
	const c = (raw as { _confidence?: unknown })._confidence;
	if (!c || typeof c !== 'object' || Array.isArray(c)) return {};
	const out: Record<string, number> = {};
	for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
		if (typeof v === 'number' && v >= 0 && v <= 1 && Number.isFinite(v)) out[k] = v;
	}
	return out;
}

/** Build the projected per-field confidence map by remapping LLM-camelCase keys to CommonFields-
 *  camelCase keys via a static mapping table. Keys not present in the LLM map are omitted (not
 *  defaulted to 0) so the caller can distinguish "LLM didn't report" from "LLM reported 0". */
function projectFieldConfidence(
	llmConfidence: Record<string, number>,
	mapping: Partial<Record<keyof CommonFields, string>>
): CommonFieldConfidence {
	const out: CommonFieldConfidence = {};
	for (const [commonKey, llmKey] of Object.entries(mapping) as Array<
		[keyof CommonFields, string]
	>) {
		const v = llmConfidence[llmKey];
		if (typeof v === 'number') out[commonKey] = v;
	}
	return out;
}

function configForDocType(docType: CategoryDocType): LlmConfig<unknown> | null {
	if (docType === 'invoice') {
		return {
			systemPrompt: INVOICE_SYSTEM_PROMPT,
			schema: invoiceSchemaV1 as ZodType<unknown>,
			schemaName: 'finance.invoice-extraction',
			mapToFields: (raw) => {
				const v = raw as InvoiceLlmV1;
				const fields: CommonFields = {
					documentNumber: v.invoiceNumber ?? null,
					counterpartyName: v.supplierName ?? null,
					currency: v.currency ? v.currency.toUpperCase() : null,
					totalAmount: v.totalAmount,
					gstAmount: v.gstAmount,
					issueDate: v.issueDate ?? null,
					dueDate: v.dueDate ?? null,
					serviceName: v.serviceName ?? null,
					period: v.period ?? null
				};
				if (!hasAnyExtractedValue(fields)) return null;
				const fieldConfidence = projectFieldConfidence(readLlmFieldConfidence(raw), {
					documentNumber: 'invoiceNumber',
					counterpartyName: 'supplierName',
					currency: 'currency',
					totalAmount: 'totalAmount',
					gstAmount: 'gstAmount',
					issueDate: 'issueDate',
					dueDate: 'dueDate',
					serviceName: 'serviceName',
					period: 'period'
				});
				return { fields, fieldConfidence };
			},
			confidenceFromValue: (raw) => (raw as InvoiceLlmV1).confidence
		};
	}
	if (docType === 'receipt') {
		return {
			systemPrompt: RECEIPT_SYSTEM_PROMPT,
			schema: receiptSchemaV1 as ZodType<unknown>,
			schemaName: 'finance.receipt-extraction',
			mapToFields: (raw) => {
				const v = raw as ReceiptLlmV1;
				const fields: CommonFields = {
					documentNumber: v.receiptNumber ?? null,
					counterpartyName: v.vendor ?? null,
					currency: v.currency ? v.currency.toUpperCase() : null,
					totalAmount: v.totalAmount,
					gstAmount: v.gstAmount,
					issueDate: v.date ?? null,
					dueDate: v.date ?? null,
					recipientName: v.recipientName ?? null,
					destination: v.destination ?? null,
					trackingNumber: v.trackingNumber ?? null
				};
				if (!hasAnyExtractedValue(fields)) return null;
				const llmConf = readLlmFieldConfidence(raw);
				const fieldConfidence = projectFieldConfidence(llmConf, {
					documentNumber: 'receiptNumber',
					counterpartyName: 'vendor',
					currency: 'currency',
					totalAmount: 'totalAmount',
					gstAmount: 'gstAmount',
					issueDate: 'date',
					recipientName: 'recipientName',
					destination: 'destination',
					trackingNumber: 'trackingNumber'
				});
				// dueDate mirrors `date`, so reuse the date confidence when the LLM provided one.
				if (typeof llmConf.date === 'number') fieldConfidence.dueDate = llmConf.date;
				return { fields, fieldConfidence };
			},
			confidenceFromValue: (raw) => (raw as ReceiptLlmV1).confidence
		};
	}
	if (docType === 'po' || docType === 'purchase_order_doc') {
		return {
			systemPrompt: PO_SYSTEM_PROMPT,
			schema: poSchemaV1 as ZodType<unknown>,
			schemaName: 'finance.po-extraction',
			mapToFields: (raw) => {
				const v = raw as PoLlmV1;
				const fields: CommonFields = {
					documentNumber: v.poNumber ?? null,
					counterpartyName: v.supplierName ?? null,
					clientName: v.clientName ?? null,
					currency: v.currency?.toUpperCase() ?? null,
					totalAmount: v.totalAmount ?? null,
					issueDate: v.date ?? null,
					dueDate: v.date ?? null,
					description: v.description ?? null,
					lineItems: v.lineItems ?? null
				};
				if (!hasAnyExtractedValue(fields)) return null;
				const llmConf = readLlmFieldConfidence(raw);
				const fieldConfidence = projectFieldConfidence(llmConf, {
					documentNumber: 'poNumber',
					counterpartyName: 'supplierName',
					clientName: 'clientName',
					currency: 'currency',
					totalAmount: 'totalAmount',
					issueDate: 'date',
					description: 'description',
					lineItems: 'lineItems'
				});
				if (typeof llmConf.date === 'number') fieldConfidence.dueDate = llmConf.date;
				return { fields, fieldConfidence };
			},
			confidenceFromValue: (raw) => (raw as PoLlmV1).confidence
		};
	}
	if (docType === 'invoice_out') {
		return {
			systemPrompt: CUSTOMER_INVOICE_SYSTEM_PROMPT,
			schema: customerInvoiceSchemaV1 as ZodType<unknown>,
			schemaName: 'finance.customer-invoice-extraction',
			mapToFields: (raw) => {
				const v = raw as CustomerInvoiceLlmV1;
				const fields: CommonFields = {
					documentNumber: v.invoiceNumber ?? null,
					counterpartyName: v.customerName ?? null,
					clientName: v.customerName ?? null,
					currency: v.currency ? v.currency.toUpperCase() : null,
					totalAmount: v.totalAmount,
					gstAmount: v.gstAmount,
					issueDate: v.invoiceDate ?? null,
					dueDate: v.invoiceDueDate ?? null,
					subtotal: v.subtotal ?? null,
					poNumber: v.poNumber ?? null
				};
				if (!hasAnyExtractedValue(fields)) return null;
				const llmConf = readLlmFieldConfidence(raw);
				const fieldConfidence = projectFieldConfidence(llmConf, {
					documentNumber: 'invoiceNumber',
					counterpartyName: 'customerName',
					clientName: 'customerName',
					currency: 'currency',
					totalAmount: 'totalAmount',
					gstAmount: 'gstAmount',
					issueDate: 'invoiceDate',
					dueDate: 'invoiceDueDate',
					subtotal: 'subtotal',
					poNumber: 'poNumber'
				});
				return { fields, fieldConfidence };
			},
			confidenceFromValue: (raw) => (raw as CustomerInvoiceLlmV1).confidence
		};
	}
	if (docType === 'contract') {
		return {
			systemPrompt: CONTRACT_SYSTEM_PROMPT,
			schema: contractSchemaV1 as ZodType<unknown>,
			schemaName: 'finance.contract-extraction',
			mapToFields: (raw) => {
				const v = raw as ContractLlmV1;
				const fields: CommonFields = {
					documentNumber: v.contractNumber ?? null,
					counterpartyName: v.clientName ?? null,
					clientName: v.clientName ?? null,
					currency: v.currency?.toUpperCase() ?? null,
					totalAmount: v.amount ?? null,
					issueDate: v.effectiveDate ?? null,
					dueDate: v.expiryDate ?? null,
					description: v.scope ?? null,
					paymentTerms: v.paymentTerms ?? null
				};
				if (!hasAnyExtractedValue(fields)) return null;
				const fieldConfidence = projectFieldConfidence(readLlmFieldConfidence(raw), {
					documentNumber: 'contractNumber',
					counterpartyName: 'clientName',
					clientName: 'clientName',
					currency: 'currency',
					totalAmount: 'amount',
					issueDate: 'effectiveDate',
					dueDate: 'expiryDate',
					description: 'scope',
					paymentTerms: 'paymentTerms'
				});
				return { fields, fieldConfidence };
			},
			confidenceFromValue: (raw) => (raw as ContractLlmV1).confidence
		};
	}
	if (docType === 'quotation') {
		return {
			systemPrompt: QUOTATION_SYSTEM_PROMPT,
			schema: quotationSchemaV1 as ZodType<unknown>,
			schemaName: 'finance.quotation-extraction',
			mapToFields: (raw) => {
				const v = raw as QuotationLlmV1;
				const fields: CommonFields = {
					documentNumber: v.quotationNumber ?? null,
					counterpartyName: v.clientName ?? null,
					clientName: v.clientName ?? null,
					currency: v.currency?.toUpperCase() ?? null,
					totalAmount: v.amount ?? null,
					issueDate: v.date ?? null,
					validUntil: v.validUntil ?? null,
					lineItems: v.lineItems ?? null
				};
				if (!hasAnyExtractedValue(fields)) return null;
				const fieldConfidence = projectFieldConfidence(readLlmFieldConfidence(raw), {
					documentNumber: 'quotationNumber',
					counterpartyName: 'clientName',
					clientName: 'clientName',
					currency: 'currency',
					totalAmount: 'amount',
					issueDate: 'date',
					validUntil: 'validUntil',
					lineItems: 'lineItems'
				});
				return { fields, fieldConfidence };
			},
			confidenceFromValue: (raw) => (raw as QuotationLlmV1).confidence
		};
	}
	return null;
}

interface LlmExtractionResult {
	fields: CommonFields;
	fieldConfidence: CommonFieldConfidence;
	/** Overall doc-level confidence — mean of populated per-field confidences, falling back to
	 *  the LLM's self-reported overall when no per-field signal is available. */
	confidence: number;
	provider: ExtractionProvider;
	quotes: Record<string, string>;
}

/** Mean of the per-field confidences for keys whose value is actually present (non-null /
 *  non-empty). Returns null when nothing usable was extracted — caller falls back to the LLM's
 *  self-reported overall confidence. */
function aggregateConfidence(
	fields: CommonFields,
	fieldConfidence: CommonFieldConfidence
): number | null {
	const values: number[] = [];
	for (const [k, v] of Object.entries(fields) as Array<[keyof CommonFields, unknown]>) {
		const present = Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== '';
		if (!present) continue;
		const c = fieldConfidence[k];
		if (typeof c === 'number') values.push(c);
	}
	if (values.length === 0) return null;
	return values.reduce((a, b) => a + b, 0) / values.length;
}

async function tryLlmExtraction(
	text: string,
	docType: CategoryDocType,
	ctx: CapabilityContextWithEnv,
	categoryId: string,
	documentId: string
): Promise<LlmExtractionResult | null> {
	if (!ctx.env) return null;
	const cfg = configForDocType(docType);
	if (!cfg) return null;

	const result = await runStructuredOutput<unknown>({
		task: `finance.extractDocumentFields.${docType ?? 'unknown'}`,
		messages: [
			{ role: 'system', content: cfg.systemPrompt },
			{ role: 'user', content: buildDocumentUserPrompt(text) }
		],
		schema: cfg.schema,
		schemaName: cfg.schemaName,
		schemaVersion: EXTRACT_DOCUMENT_FIELDS_SCHEMA_VERSION,
		modelHint: { capability: 'structured_extraction', priority: 'quality' },
		metadata: {
			tenantId: ctx.tenantId ?? 'default',
			userId: ctx.userId,
			capabilityId: 'finance.extract-document-fields',
			promptVersion: EXTRACT_DOCUMENT_FIELDS_PROMPT_VERSION,
			schemaVersion: EXTRACT_DOCUMENT_FIELDS_SCHEMA_VERSION,
			riskLevel: 'R2',
			inputRefs: [`document:${documentId}`, `category:${categoryId}`]
		},
		env: ctx.env
	});

	if (result.status !== 'success') {
		console.warn(
			`[extract-document-fields] LLM call failed for ${docType}/${documentId}: status=${result.status} error=${result.error}`
		);
		return null;
	}
	const raw = result.result.value;
	const mapped = cfg.mapToFields(raw);
	if (!mapped) return null;
	const overallFromLlm = cfg.confidenceFromValue(raw);
	const confidence =
		aggregateConfidence(mapped.fields, mapped.fieldConfidence) ?? overallFromLlm ?? 0.8;
	const provider: ExtractionProvider =
		result.result.meta.providerId === 'workers_ai' ? 'workers_ai' : 'external_api';

	// Extract verbatim source quotes from the optional _quotes key.
	const rawQuotes = (raw as Record<string, unknown>)._quotes;
	const quotes: Record<string, string> = {};
	if (rawQuotes && typeof rawQuotes === 'object' && !Array.isArray(rawQuotes)) {
		for (const [k, v] of Object.entries(rawQuotes as Record<string, unknown>)) {
			if (typeof v === 'string' && v.trim().length > 0) quotes[k] = v.trim();
		}
	}

	return {
		fields: mapped.fields,
		fieldConfidence: mapped.fieldConfidence,
		confidence,
		provider,
		quotes
	};
}

// ---------------------------------------------------------------------------
// Capability
// ---------------------------------------------------------------------------

function buildEvidenceForFields(provider: ExtractionProvider, fields: Record<string, unknown>): FinanceEvidence[] {
	const labels = Object.keys(fields);
	return labels.map((field) => ({
		type: 'extracted_field',
		refId: `${provider}://${field}`,
		summary: `Extracted ${field} via ${provider}`
	}));
}

function categoryValue(key: string, fields: CommonFields): unknown {
	switch (key) {
		case 'invoice_number':
		case 'receipt_number':
		case 'contract_number':
		case 'quotation_number':
			return fields.documentNumber;
		case 'po_number':
			return fields.poNumber ?? fields.documentNumber;
		case 'supplier_name':
		case 'vendor':
			return fields.counterpartyName;
		case 'recipient_name':
		case 'staff_name':
			return fields.recipientName ?? fields.counterpartyName;
		case 'customer_name':
		case 'client_name':
			return fields.clientName ?? fields.counterpartyName;
		case 'date':
		case 'invoice_date':
		case 'effective_date':
			return fields.issueDate;
		case 'expiry_date':
		case 'due_date':
		case 'invoice_due_date':
			return fields.dueDate;
		case 'valid_until':
			return fields.validUntil;
		case 'amount':
		case 'invoice_amount':
			return fields.totalAmount;
		case 'currency':
		case 'invoice_currency':
			return fields.currency;
		case 'gst_amount':
		case 'invoice_gst_amount':
			return fields.gstAmount;
		case 'invoice_subtotal':
			return fields.subtotal;
		case 'description':
		case 'scope':
			return fields.description;
		case 'payment_terms':
			return fields.paymentTerms;
		case 'line_items':
			return fields.lineItems;
		case 'tracking_number':
			return fields.trackingNumber;
		case 'service_name':
			return fields.serviceName;
		case 'period':
			return fields.period;
		case 'destination':
			return fields.destination;
		default:
			return undefined;
	}
}

interface ProjectedExtraction {
	fields: Record<string, unknown>;
	fieldConfidence: Record<string, number>;
}

/** Projects both `fields` and `fieldConfidence` in lockstep using the same `categoryValue`
 *  reverse-mapping. Confidence is only emitted for keys whose value is actually present —
 *  so a null/empty field never carries a stale confidence number from the LLM. */
function projectForCategory(
	fields: CommonFields,
	fieldConfidence: CommonFieldConfidence,
	category: CategoryDefinition | null
): ProjectedExtraction {
	const outFields: Record<string, unknown> = {};
	const outConf: Record<string, number> = {};
	// CommonFieldConfidence has the same key shape as CommonFields (just number-valued), so the
	// same `categoryValue` lookup works for both maps when cast.
	const confAsFields = fieldConfidence as unknown as CommonFields;
	if (!category) {
		for (const [k, v] of Object.entries(fields)) {
			if (v === null || v === undefined || v === '') continue;
			outFields[k] = v;
			const c = fieldConfidence[k as keyof CommonFields];
			if (typeof c === 'number') outConf[k] = c;
		}
		return { fields: outFields, fieldConfidence: outConf };
	}
	for (const key of category.llmFields) {
		const v = categoryValue(key, fields);
		if (v === null || v === undefined || v === '') continue;
		outFields[key] = v;
		const c = categoryValue(key, confAsFields);
		if (typeof c === 'number') outConf[key] = c;
	}
	return { fields: outFields, fieldConfidence: outConf };
}

function outputFor(
	fields: CommonFields,
	fieldConfidence: CommonFieldConfidence,
	category: CategoryDefinition | null,
	outputShape: ExtractDocumentFieldsInput['outputShape']
): ProjectedExtraction {
	if (outputShape === 'legacy') {
		const legacyKeys: Array<keyof CommonFields> = [
			'documentNumber',
			'counterpartyName',
			'currency',
			'totalAmount',
			'gstAmount',
			'issueDate',
			'dueDate'
		];
		const outFields: Record<string, unknown> = {};
		const outConf: Record<string, number> = {};
		for (const k of legacyKeys) {
			const v = fields[k] ?? null;
			outFields[k] = v;
			const c = fieldConfidence[k];
			if (typeof c === 'number' && v !== null && v !== undefined && v !== '') outConf[k] = c;
		}
		return { fields: outFields, fieldConfidence: outConf };
	}
	return projectForCategory(fields, fieldConfidence, category);
}

/** Synthesize a per-field confidence map by stamping a single scalar onto every CommonFields key
 *  that has a present value. Used by the fixture/mock path (no per-field signal available). */
function fanOutConfidence(fields: CommonFields, confidence: number): CommonFieldConfidence {
	const out: CommonFieldConfidence = {};
	for (const [k, v] of Object.entries(fields) as Array<[keyof CommonFields, unknown]>) {
		const present = Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== '';
		if (present) out[k] = confidence;
	}
	return out;
}

function resolveDocType(input: ExtractDocumentFieldsInput): {
	docType: CategoryDocType;
	category: CategoryDefinition | null;
} {
	if (input.categoryId) {
		const cat = findCategoryById(input.categoryId);
		if (cat) return { docType: cat.categoryDocType, category: cat };
	}
	return { docType: 'invoice', category: null };
}

export const extractDocumentFieldsCapability: FinanceCapability<
	ExtractDocumentFieldsInput,
	ExtractDocumentFieldsOutput
> = {
	id: 'finance.extract-document-fields',
	description:
		'Extract structured fields from a finance or archive document per the workflow-selected category.',
	riskLevel: 'R2',

	async execute(input, ctx) {
		const ctxWithEnv = ctx as CapabilityContextWithEnv;
		const { docType, category } = resolveDocType(input);

		// 1. No usable text, or a direct unit/demo call without runtime env → fixture mock fallback.
		if (!input.text || input.text.length < MIN_TEXT_LENGTH_FOR_REAL_EXTRACT || !ctxWithEnv.env) {
			const fixture = pickFixture({ documentId: input.documentId, fileName: input.fileName });
			// Mock has no per-field signal — fan the scalar fixture confidence across every populated key.
			const projected = outputFor(
				fixture.fields,
				fanOutConfidence(fixture.fields, fixture.confidence),
				category,
				input.outputShape
			);
			return {
				fields: projected.fields,
				confidence: fixture.confidence,
				fieldConfidence: projected.fieldConfidence,
				evidence:
					input.outputShape === 'legacy'
						? buildEvidence(fixture.fields)
						: buildEvidenceForFields('mock-v1', projected.fields),
				provider: 'mock-v1'
			};
		}

		// 2. Real extracted text always goes through the category-specific LLM schema.
		// Normalize and truncate per doc-type budget before sending to the LLM.
		// Contracts/quotations get more budget (key data can appear on the last page);
		// receipts and invoices are almost always single-page.
		const TEXT_BUDGET: Partial<Record<NonNullable<CategoryDocType>, number>> = {
			invoice: 10_000,
			receipt: 6_000,
			po: 15_000,
			invoice_out: 10_000,
			contract: 16_000,
			quotation: 12_000,
			purchase_order_doc: 15_000
		};
		const EXPANDED_BUDGET: Partial<Record<NonNullable<CategoryDocType>, number>> = {
			po: 20_000,
			purchase_order_doc: 20_000
		};
		const LOW_CONFIDENCE_THRESHOLD = 0.4;

		const normalized = normalizeDocumentText(input.text);
		const isPo = docType === 'po' || docType === 'purchase_order_doc';
		const budget = docType ? TEXT_BUDGET[docType] ?? 12_000 : 12_000;

		// POs and multi-page documents: allocate the full budget to the front.
		// Most structured fields (PO number, vendor, date, items, totals) appear
		// in the first few pages; trailing pages are T&C boilerplate.
		const processedText = isPo
			? truncateFrontHeavy(normalized, budget)
			: smartTruncate(normalized, budget);

		const categoryIdRef = category?.id ?? input.categoryId ?? 'unknown';
		let llm = await tryLlmExtraction(processedText, docType, ctxWithEnv, categoryIdRef, input.documentId);

		// Retry with expanded budget or full text when confidence is very low.
		if (isPo && (!llm || llm.confidence < LOW_CONFIDENCE_THRESHOLD) && normalized.length > budget) {
			const expandedBudget = docType ? EXPANDED_BUDGET[docType] ?? normalized.length : normalized.length;
			const expandedText = expandedBudget >= normalized.length
				? normalized
				: truncateFrontHeavy(normalized, expandedBudget);
			console.log(
				`[extract-document-fields] PO low confidence (${llm?.confidence ?? 0}), retrying with ${expandedText.length} chars (was ${processedText.length})`
			);
			const retry = await tryLlmExtraction(expandedText, docType, ctxWithEnv, categoryIdRef, input.documentId);
			if (retry && (!llm || retry.confidence > llm.confidence)) llm = retry;
		}

		if (llm) {
			const projected = outputFor(llm.fields, llm.fieldConfidence, category, input.outputShape);
			return {
				fields: projected.fields,
				confidence: llm.confidence,
				fieldConfidence: projected.fieldConfidence,
				evidence: buildEvidenceForFields(llm.provider, projected.fields),
				sourceQuotes: Object.keys(llm.quotes).length > 0 ? llm.quotes : undefined,
				provider: llm.provider
			};
		}

		// 3. LLM failed or returned an unusable shape. Leave fields blank instead
		// of falling back to regex/mock values.
		console.warn(
			`[extract-document-fields] extraction produced no usable fields for ${docType}/${input.documentId} (categoryId=${input.categoryId})`
		);
		return {
			fields: {},
			confidence: 0,
			fieldConfidence: {},
			evidence: [],
			provider: 'none'
		};
	}
};
