/**
 * Behavioral tests for the field-extraction capability.
 *
 * Mocks `runStructuredOutput` so we can drive synthetic LLM responses and assert
 * on the capability's projection logic — specifically:
 *   - Partial extractions (some null fields) survive instead of getting dropped.
 *     This regressed on a real Pro Forma invoice where `invoiceNumber` was blank
 *     but every other field was present.
 *   - `_confidence` is honored per-field and projected to the category's
 *     snake_case key shape (no fan-out from the overall confidence).
 *   - The overall `confidence` scalar is the mean of populated fields'
 *     confidences, not the LLM's self-reported overall.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$platform/ai/ai-runtime', () => ({
	runStructuredOutput: vi.fn()
}));

import { runStructuredOutput } from '$platform/ai/ai-runtime';
import { extractDocumentFieldsCapability } from '$modules/finance/capabilities/extract-document-fields/capability';

const mockRun = runStructuredOutput as ReturnType<typeof vi.fn>;

function llmSuccess(value: unknown) {
	return {
		status: 'success' as const,
		result: {
			value,
			meta: { providerId: 'openai' }
		}
	};
}

const CTX = {
	tenantId: 'default',
	userId: 'test',
	env: { AI: {} } as unknown as Env,
	useMock: false
};

const LONG_TEXT = 'x'.repeat(200);

beforeEach(() => {
	mockRun.mockReset();
});

describe('extractDocumentFieldsCapability — partial extraction', () => {
	it('returns the populated fields even when invoiceNumber is missing (Pro Forma case)', async () => {
		mockRun.mockResolvedValueOnce(
			llmSuccess({
				supplierName: 'RNG Wine Ltd',
				invoiceNumber: null, // Pro Forma — no invoice number yet
				issueDate: '2026-01-28',
				dueDate: null,
				totalAmount: 5210,
				gstAmount: null,
				currency: 'HKD',
				_confidence: {
					supplierName: 0.95,
					issueDate: 0.92,
					totalAmount: 0.98,
					currency: 0.9
				}
			})
		);

		const out = await extractDocumentFieldsCapability.execute(
			{
				documentId: 'doc-pro-forma',
				fileName: 'rng-wine.jpeg',
				text: LONG_TEXT,
				categoryId: 'expense.sales_cost.invoice'
			},
			CTX
		);

		// Populated fields are present in category snake_case shape.
		expect(out.fields.supplier_name).toBe('RNG Wine Ltd');
		expect(out.fields.date).toBe('2026-01-28');
		expect(out.fields.amount).toBe(5210);
		expect(out.fields.currency).toBe('HKD');
		// Missing fields are simply absent — not present with null/0.
		expect(out.fields.invoice_number).toBeUndefined();
		expect(out.fields.due_date).toBeUndefined();
		expect(out.fields.gst_amount).toBeUndefined();
		// Per-field confidence is per-field, not a fan-out.
		expect(out.fieldConfidence.supplier_name).toBe(0.95);
		expect(out.fieldConfidence.amount).toBe(0.98);
		expect(out.fieldConfidence.currency).toBe(0.9);
		expect(out.fieldConfidence.date).toBe(0.92);
		// Confidence is only emitted for fields that exist.
		expect(out.fieldConfidence.invoice_number).toBeUndefined();
		expect(out.fieldConfidence.gst_amount).toBeUndefined();
	});

	it('returns empty fields when the LLM returned all-null (nothing usable)', async () => {
		mockRun.mockResolvedValueOnce(
			llmSuccess({
				supplierName: null,
				invoiceNumber: null,
				issueDate: null,
				dueDate: null,
				totalAmount: null,
				gstAmount: null,
				currency: null
			})
		);

		const out = await extractDocumentFieldsCapability.execute(
			{
				documentId: 'doc-blank',
				text: LONG_TEXT,
				categoryId: 'expense.sales_cost.invoice'
			},
			CTX
		);

		expect(Object.keys(out.fields)).toHaveLength(0);
		expect(Object.keys(out.fieldConfidence)).toHaveLength(0);
		expect(out.confidence).toBe(0);
		expect(out.provider).toBe('none');
	});
});

describe('extractDocumentFieldsCapability — confidence aggregation', () => {
	it('overall confidence is the mean of per-field confidences for populated fields', async () => {
		mockRun.mockResolvedValueOnce(
			llmSuccess({
				supplierName: 'Acme',
				invoiceNumber: 'INV-1',
				issueDate: '2026-01-01',
				dueDate: null,
				totalAmount: 100,
				gstAmount: null,
				currency: 'SGD',
				confidence: 0.5, // LLM self-reported overall — should be ignored when per-field is present
				_confidence: {
					supplierName: 1.0,
					invoiceNumber: 1.0,
					issueDate: 1.0,
					totalAmount: 1.0,
					currency: 1.0
				}
			})
		);

		const out = await extractDocumentFieldsCapability.execute(
			{
				documentId: 'doc-mean',
				text: LONG_TEXT,
				categoryId: 'expense.sales_cost.invoice'
			},
			CTX
		);

		// All populated fields have confidence 1.0 → mean is 1.0 (not the 0.5 self-reported).
		expect(out.confidence).toBe(1.0);
	});

	it('falls back to LLM-reported overall confidence when _confidence is absent', async () => {
		mockRun.mockResolvedValueOnce(
			llmSuccess({
				supplierName: 'Acme',
				invoiceNumber: 'INV-1',
				issueDate: '2026-01-01',
				dueDate: null,
				totalAmount: 100,
				gstAmount: null,
				currency: 'SGD',
				confidence: 0.75
				// no _confidence
			})
		);

		const out = await extractDocumentFieldsCapability.execute(
			{
				documentId: 'doc-fallback',
				text: LONG_TEXT,
				categoryId: 'expense.sales_cost.invoice'
			},
			CTX
		);

		expect(out.confidence).toBe(0.75);
		// fieldConfidence should be empty since no per-field signal was provided.
		expect(Object.keys(out.fieldConfidence)).toHaveLength(0);
	});
});
