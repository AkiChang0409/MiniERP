import { describe, it, expect } from 'vitest';
import {
	buildIntakeReviewCard,
	buildResultCard,
	type IntakeReviewCardInput
} from '../../platform/integrations/lark/cards/intake-review-card';

/** Recursively collect every action object's `value` from the card tree. */
function actionValues(card: Record<string, unknown>): Array<Record<string, unknown>> {
	const elements = (card.elements ?? []) as Array<Record<string, unknown>>;
	const action = elements.find((e) => e.tag === 'action');
	const actions = (action?.actions ?? []) as Array<Record<string, unknown>>;
	return actions.map((a) => a.value as Record<string, unknown>).filter(Boolean);
}

function elementContents(card: Record<string, unknown>): string {
	return JSON.stringify(card.elements ?? []);
}

const baseInput: IntakeReviewCardInput = {
	documentId: 'doc-123',
	fileName: 'grab-receipt.pdf',
	categoryId: 'expense.opex.transport',
	documentType: 'receipt',
	fields: {
		receipt_number: 'R-001',
		amount: 23.5,
		currency: 'SGD',
		vendor: 'Grab',
		reimbursement: true,
		project_id: 'proj-should-be-hidden',
		line_items: [{ description: 'Ride' }, { description: 'Booking fee' }]
	},
	confidence: { amount: 0.4 },
	appBaseUrl: 'https://smartfin-v4.aki-wang.workers.dev'
};

describe('buildIntakeReviewCard', () => {
	it('embeds confirm + reject routing values and an open-in-app url', () => {
		const card = buildIntakeReviewCard(baseInput);
		const values = actionValues(card);

		expect(values).toContainEqual({
			action: 'confirm',
			document_id: 'doc-123',
			category_id: 'expense.opex.transport'
		});
		expect(values).toContainEqual({ action: 'reject', document_id: 'doc-123' });

		const elements = (card.elements ?? []) as Array<Record<string, unknown>>;
		const actions = (elements.find((e) => e.tag === 'action')?.actions ?? []) as Array<
			Record<string, unknown>
		>;
		const openBtn = actions.find((a) => typeof a.url === 'string');
		expect(openBtn?.url).toBe('https://smartfin-v4.aki-wang.workers.dev/finance/inbox/doc-123');
	});

	it('renders labelled field values, summarises line_items, and hides project_id', () => {
		const content = elementContents(buildIntakeReviewCard(baseInput));
		expect(content).toContain('Receipt number');
		expect(content).toContain('R-001');
		expect(content).toContain('Vendor');
		expect(content).toContain('2 项'); // line_items summarised by count
		expect(content).toContain('是'); // reimbursement boolean → 是
		expect(content).not.toContain('proj-should-be-hidden'); // project_id hidden
	});

	it('flags low-confidence fields with a warning marker', () => {
		const content = elementContents(buildIntakeReviewCard(baseInput));
		// amount has confidence 0.4 (< 0.5) → ⚠️ appended to its label block.
		expect(content).toContain('⚠️');
	});

	it('falls back gracefully when no fields extracted and category is unknown', () => {
		const card = buildIntakeReviewCard({
			documentId: 'doc-x',
			fileName: 'mystery.pdf',
			categoryId: null,
			fields: {},
			appBaseUrl: 'https://x.dev/'
		});
		const content = elementContents(card);
		expect(content).toContain('未抽取到可展示字段');
		// confirm button still present with empty category_id
		expect(actionValues(card)).toContainEqual({
			action: 'confirm',
			document_id: 'doc-x',
			category_id: ''
		});
	});
});

describe('buildResultCard', () => {
	it('builds a single-div card with the given header template and content', () => {
		const card = buildResultCard('✅ 已确认', '已记账。', 'green');
		const header = card.header as Record<string, unknown>;
		expect(header.template).toBe('green');
		expect(JSON.stringify(card.elements)).toContain('已记账。');
	});
});
