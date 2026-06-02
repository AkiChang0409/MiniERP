import { describe, it, expect } from 'vitest';
import {
	invoiceSchemaV1,
	receiptSchemaV1,
	poSchemaV1,
	customerInvoiceSchemaV1,
	contractSchemaV1,
	quotationSchemaV1
} from '$modules/finance/capabilities/extract-document-fields/schemas';

// ─── Helpers ────────────────────────────────────────────────────────────────

const validInvoice = {
	supplierName: 'Acme Corp',
	invoiceNumber: 'INV-001',
	issueDate: '2025-01-15',
	dueDate: '2025-02-15',
	totalAmount: 109,
	gstAmount: 9,
	currency: 'SGD',
	confidence: 0.95
};

const nullInvoice = {
	supplierName: null,
	invoiceNumber: null,
	issueDate: null,
	dueDate: null,
	totalAmount: null,
	gstAmount: null,
	currency: null
};

// ─── invoiceSchemaV1 ─────────────────────────────────────────────────────────

describe('invoiceSchemaV1', () => {
	it('parses a fully populated invoice', () => {
		expect(invoiceSchemaV1.safeParse(validInvoice).success).toBe(true);
	});

	it('accepts all-null fields (LLM returned nothing useful)', () => {
		expect(invoiceSchemaV1.safeParse(nullInvoice).success).toBe(true);
	});

	it('rejects non-finite totalAmount', () => {
		expect(
			invoiceSchemaV1.safeParse({ ...nullInvoice, totalAmount: Infinity }).success
		).toBe(false);
	});

	it('rejects NaN gstAmount', () => {
		expect(
			invoiceSchemaV1.safeParse({ ...nullInvoice, gstAmount: NaN }).success
		).toBe(false);
	});

	it('rejects confidence > 1', () => {
		expect(
			invoiceSchemaV1.safeParse({ ...validInvoice, confidence: 1.5 }).success
		).toBe(false);
	});

	it('rejects confidence < 0', () => {
		expect(
			invoiceSchemaV1.safeParse({ ...validInvoice, confidence: -0.1 }).success
		).toBe(false);
	});

	it('allows confidence to be omitted', () => {
		const { confidence: _, ...withoutConfidence } = validInvoice;
		expect(invoiceSchemaV1.safeParse(withoutConfidence).success).toBe(true);
	});

	it('accepts per-field _confidence map', () => {
		const parsed = invoiceSchemaV1.safeParse({
			...validInvoice,
			_confidence: {
				invoiceNumber: 0.99,
				supplierName: 0.8,
				totalAmount: 0.95
			}
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data._confidence?.invoiceNumber).toBe(0.99);
		}
	});

	it('rejects _confidence values outside [0,1]', () => {
		expect(
			invoiceSchemaV1.safeParse({
				...validInvoice,
				_confidence: { invoiceNumber: 1.5 }
			}).success
		).toBe(false);
	});

	it('accepts partial invoice with only some fields populated (pro forma case)', () => {
		// Pro forma invoices often omit the invoice number. The schema must allow it,
		// and downstream mapToFields must not gate on all-fields-present.
		expect(
			invoiceSchemaV1.safeParse({
				supplierName: 'RNG Wine Ltd',
				invoiceNumber: null,
				issueDate: '2026-01-28',
				dueDate: null,
				totalAmount: 5210,
				gstAmount: null,
				currency: 'HKD'
			}).success
		).toBe(true);
	});
});

// ─── receiptSchemaV1 ─────────────────────────────────────────────────────────

describe('receiptSchemaV1', () => {
	it('parses a valid receipt', () => {
		expect(
			receiptSchemaV1.safeParse({
				vendor: 'Grab',
				receiptNumber: 'R-999',
				date: '2025-03-01',
				totalAmount: 25.5,
				gstAmount: 0,
				currency: 'SGD',
				recipientName: null,
				confidence: 0.88
			}).success
		).toBe(true);
	});

	it('allows optional destination and trackingNumber to be absent', () => {
		expect(
			receiptSchemaV1.safeParse({
				vendor: null,
				receiptNumber: null,
				date: null,
				totalAmount: null,
				gstAmount: null,
				currency: null,
				recipientName: null
			}).success
		).toBe(true);
	});

	it('rejects non-finite totalAmount', () => {
		expect(
			receiptSchemaV1.safeParse({
				vendor: null,
				receiptNumber: null,
				date: null,
				totalAmount: Infinity,
				gstAmount: null,
				currency: null,
				recipientName: null
			}).success
		).toBe(false);
	});
});

// ─── poSchemaV1 ──────────────────────────────────────────────────────────────

describe('poSchemaV1', () => {
	it('parses a PO with line items', () => {
		expect(
			poSchemaV1.safeParse({
				supplierName: 'TechVend',
				poNumber: 'PO-2025-001',
				date: '2025-01-10',
				totalAmount: 5000,
				currency: 'SGD',
				description: 'Office equipment',
				lineItems: [{ description: 'Laptop', qty: 1, unitPrice: 5000, amount: 5000 }],
				confidence: 0.92
			}).success
		).toBe(true);
	});

	it('accepts null lineItems', () => {
		expect(
			poSchemaV1.safeParse({
				supplierName: null,
				poNumber: null,
				date: null,
				totalAmount: null,
				currency: null,
				description: null,
				lineItems: null
			}).success
		).toBe(true);
	});

	it('rejects non-finite line item amount', () => {
		expect(
			poSchemaV1.safeParse({
				supplierName: null,
				poNumber: null,
				date: null,
				totalAmount: null,
				currency: null,
				description: null,
				lineItems: [{ description: 'Bad', qty: 1, unitPrice: 100, amount: Infinity }]
			}).success
		).toBe(false);
	});
});

// ─── customerInvoiceSchemaV1 ─────────────────────────────────────────────────

describe('customerInvoiceSchemaV1', () => {
	it('parses a valid customer invoice', () => {
		expect(
			customerInvoiceSchemaV1.safeParse({
				customerName: 'Client ABC',
				invoiceNumber: 'CINV-001',
				invoiceDate: '2025-04-01',
				invoiceDueDate: '2025-05-01',
				totalAmount: 10900,
				gstAmount: 900,
				subtotal: 10000,
				currency: 'SGD',
				poNumber: null,
				confidence: 0.99
			}).success
		).toBe(true);
	});

	it('accepts all-null fields', () => {
		expect(
			customerInvoiceSchemaV1.safeParse({
				customerName: null,
				invoiceNumber: null,
				invoiceDate: null,
				invoiceDueDate: null,
				totalAmount: null,
				gstAmount: null,
				subtotal: null,
				currency: null,
				poNumber: null
			}).success
		).toBe(true);
	});
});

// ─── contractSchemaV1 ────────────────────────────────────────────────────────

describe('contractSchemaV1', () => {
	it('parses a fully populated contract', () => {
		expect(
			contractSchemaV1.safeParse({
				contractNumber: 'CONT-2025-001',
				clientName: 'Partner Co',
				effectiveDate: '2025-01-01',
				expiryDate: '2025-12-31',
				amount: 120000,
				currency: 'SGD',
				paymentTerms: 'Net 30',
				scope: 'Software development services'
			}).success
		).toBe(true);
	});

	it('accepts all-null contract fields', () => {
		expect(
			contractSchemaV1.safeParse({
				contractNumber: null,
				clientName: null,
				effectiveDate: null,
				expiryDate: null,
				amount: null,
				currency: null,
				paymentTerms: null,
				scope: null
			}).success
		).toBe(true);
	});
});

// ─── quotationSchemaV1 ───────────────────────────────────────────────────────

describe('quotationSchemaV1', () => {
	it('parses a valid quotation with line items', () => {
		expect(
			quotationSchemaV1.safeParse({
				quotationNumber: 'Q-2025-001',
				clientName: 'Prospect Inc',
				date: '2025-02-15',
				validUntil: '2025-03-15',
				amount: 8000,
				currency: 'SGD',
				lineItems: [{ description: 'Consulting', qty: 10, unitPrice: 800, amount: 8000 }]
			}).success
		).toBe(true);
	});

	it('accepts null lineItems', () => {
		expect(
			quotationSchemaV1.safeParse({
				quotationNumber: null,
				clientName: null,
				date: null,
				validUntil: null,
				amount: null,
				currency: null,
				lineItems: null
			}).success
		).toBe(true);
	});

	it('rejects non-finite amount in line item', () => {
		expect(
			quotationSchemaV1.safeParse({
				quotationNumber: null,
				clientName: null,
				date: null,
				validUntil: null,
				amount: null,
				currency: null,
				lineItems: [{ description: 'Bad', qty: 1, unitPrice: 100, amount: NaN }]
			}).success
		).toBe(false);
	});
});
