import { z } from 'zod';

/**
 * Lenient numeric field: accepts both JS numbers and string representations
 * (e.g. "44,800.00", "44800", "1") that LLMs commonly return despite being
 * instructed to return plain numbers. Strips thousands separators and currency
 * symbols before parsing. Returns null for unparseable or explicitly null values.
 */
const lenientNumber = z.preprocess((val) => {
	if (val === null || val === undefined) return null;
	// Pass JS numbers through unchanged — .finite() will reject Infinity/NaN as before.
	if (typeof val === 'number') return val;
	if (typeof val === 'string') {
		const cleaned = val.replace(/[,$€£¥₹\s]/g, '').trim();
		if (cleaned === '' || cleaned === '-') return null;
		const n = parseFloat(cleaned);
		return isFinite(n) ? n : null;
	}
	return null;
}, z.number().finite().nullable());

/**
 * Per-document-type LLM output schemas (v1).
 *
 * Each schema corresponds to one of the `categoryDocType` values declared in
 * `workflows/financial-document-intake/categories.ts`. The capability
 * orchestrator picks the schema by `categoryDocType` and validates the LLM
 * response against it before mapping back to the common
 * `ExtractedInvoiceFields` shape that downstream steps consume.
 *
 * Versioned per ref_files/v4/phase0-6/05 §15.
 */

// ---------------------------------------------------------------------------
// Invoice (supplier invoice / sales_cost.invoice / ai_subscription)
// ---------------------------------------------------------------------------
export const invoiceSchemaV1 = z.object({
	supplierName: z.string().nullable(),
	invoiceNumber: z.string().nullable(),
	issueDate: z.string().nullable(),
	dueDate: z.string().nullable(),
	totalAmount: lenientNumber,
	gstAmount: lenientNumber,
	currency: z.string().nullable(),
	serviceName: z.string().nullable().optional(),
	period: z.string().nullable().optional(),
	confidence: z.number().min(0).max(1).optional(),
	_quotes: z.record(z.string(), z.string().nullable()).optional(),
	_confidence: z.record(z.string(), z.number().min(0).max(1)).optional()
});
export type InvoiceLlmV1 = z.infer<typeof invoiceSchemaV1>;

// ---------------------------------------------------------------------------
// Receipt (transport / accommodation / meal / gift / logistics / others /
// sales_cost.receipt)
// ---------------------------------------------------------------------------
export const receiptSchemaV1 = z.object({
	vendor: z.string().nullable(),
	receiptNumber: z.string().nullable(),
	date: z.string().nullable(),
	totalAmount: lenientNumber,
	gstAmount: lenientNumber,
	currency: z.string().nullable(),
	recipientName: z.string().nullable(),
	destination: z.string().nullable().optional(),
	trackingNumber: z.string().nullable().optional(),
	confidence: z.number().min(0).max(1).optional(),
	_quotes: z.record(z.string(), z.string().nullable()).optional(),
	_confidence: z.record(z.string(), z.number().min(0).max(1)).optional()
});
export type ReceiptLlmV1 = z.infer<typeof receiptSchemaV1>;

// ---------------------------------------------------------------------------
// Purchase order (opex.purchase, document_only.purchase_order)
// ---------------------------------------------------------------------------
const lineItemSchemaV1 = z.object({
	description: z.string().nullable(),
	qty: lenientNumber,
	unitPrice: lenientNumber,
	amount: lenientNumber
});

export const poSchemaV1 = z.object({
	supplierName: z.string().nullable(),
	clientName: z.string().nullable().optional(),
	poNumber: z.string().nullable(),
	date: z.string().nullable(),
	totalAmount: lenientNumber,
	currency: z.string().nullable(),
	description: z.string().nullable(),
	lineItems: z.array(lineItemSchemaV1).nullable().optional(),
	confidence: z.number().min(0).max(1).optional(),
	_quotes: z.record(z.string(), z.string().nullable()).optional(),
	_confidence: z.record(z.string(), z.number().min(0).max(1)).optional()
});
export type PoLlmV1 = z.infer<typeof poSchemaV1>;

// ---------------------------------------------------------------------------
// Customer invoice (revenue.invoice_out)
// ---------------------------------------------------------------------------
export const customerInvoiceSchemaV1 = z.object({
	customerName: z.string().nullable(),
	invoiceNumber: z.string().nullable(),
	invoiceDate: z.string().nullable(),
	invoiceDueDate: z.string().nullable(),
	totalAmount: lenientNumber,
	gstAmount: lenientNumber,
	subtotal: lenientNumber,
	currency: z.string().nullable(),
	poNumber: z.string().nullable(),
	confidence: z.number().min(0).max(1).optional(),
	_quotes: z.record(z.string(), z.string().nullable()).optional(),
	_confidence: z.record(z.string(), z.number().min(0).max(1)).optional()
});
export type CustomerInvoiceLlmV1 = z.infer<typeof customerInvoiceSchemaV1>;

// ---------------------------------------------------------------------------
// Archive documents (document_only.contract / document_only.quotation)
// ---------------------------------------------------------------------------
export const contractSchemaV1 = z.object({
	contractNumber: z.string().nullable(),
	clientName: z.string().nullable(),
	effectiveDate: z.string().nullable(),
	expiryDate: z.string().nullable(),
	amount: lenientNumber,
	currency: z.string().nullable(),
	paymentTerms: z.string().nullable(),
	scope: z.string().nullable(),
	confidence: z.number().min(0).max(1).optional(),
	_quotes: z.record(z.string(), z.string().nullable()).optional(),
	_confidence: z.record(z.string(), z.number().min(0).max(1)).optional()
});
export type ContractLlmV1 = z.infer<typeof contractSchemaV1>;

export const quotationSchemaV1 = z.object({
	quotationNumber: z.string().nullable(),
	clientName: z.string().nullable(),
	date: z.string().nullable(),
	validUntil: z.string().nullable(),
	amount: lenientNumber,
	currency: z.string().nullable(),
	lineItems: z.array(lineItemSchemaV1).nullable(),
	confidence: z.number().min(0).max(1).optional(),
	_quotes: z.record(z.string(), z.string().nullable()).optional(),
	_confidence: z.record(z.string(), z.number().min(0).max(1)).optional()
});
export type QuotationLlmV1 = z.infer<typeof quotationSchemaV1>;

export const EXTRACT_DOCUMENT_FIELDS_SCHEMA_VERSION = 'v3';
