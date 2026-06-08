import { describe, it, expect } from 'vitest';
import { buildVisionFieldExtractionPrompt } from '../../modules/finance/capabilities/extract-document-fields/vision-field-prompts';

describe('buildVisionFieldExtractionPrompt', () => {
	it('returns a category-guided prompt naming the supplier-invoice fields', () => {
		const prompt = buildVisionFieldExtractionPrompt('expense.sales_cost.invoice');
		expect(prompt).not.toBeNull();
		// User prompt names the document category and the catalog field list.
		expect(prompt!.user).toContain('Supplier invoice');
		expect(prompt!.user).toContain('invoice number');
		expect(prompt!.user).toContain('supplier name');
		// line_items is requested via the table instruction, not as a "- field" line.
		expect(prompt!.user).not.toMatch(/^- line items/m);
		expect(prompt!.user.toLowerCase()).toContain('line-item table');
		// System prompt keeps the Markdown-output + accuracy contract.
		expect(prompt!.system).toContain('## Requested fields');
		expect(prompt!.system).toContain('## Full transcription');
	});

	it('returns null for a category with no extractable fields (allowance)', () => {
		expect(buildVisionFieldExtractionPrompt('expense.opex.allowance')).toBeNull();
	});

	it('returns null for an unknown category id', () => {
		expect(buildVisionFieldExtractionPrompt('not.a.real.category')).toBeNull();
		expect(buildVisionFieldExtractionPrompt(undefined)).toBeNull();
	});

	it('covers the archive contract field set', () => {
		const prompt = buildVisionFieldExtractionPrompt('document_only.contract');
		expect(prompt).not.toBeNull();
		expect(prompt!.user).toContain('Contract');
		expect(prompt!.user).toContain('contract number');
		expect(prompt!.user).toContain('effective date');
	});
});
