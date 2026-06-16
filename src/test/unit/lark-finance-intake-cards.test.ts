import { describe, it, expect } from 'vitest';
import {
	buildUploadPromptCard,
	buildNoticeCard,
	buildProjectPickerCard,
	buildEditableReviewCard
} from '../../platform/integrations/lark/cards/finance-intake-cards';

function findByTag(elements: unknown, tag: string): Record<string, unknown> | undefined {
	const arr = (elements ?? []) as Array<Record<string, unknown>>;
	return arr.find((e) => e.tag === tag);
}

describe('buildUploadPromptCard / buildNoticeCard', () => {
	it('upload prompt asks for a document', () => {
		const json = JSON.stringify(buildUploadPromptCard());
		expect(json).toContain('财务文件录入');
		expect(json).toContain('单据');
	});
	it('notice card honours title + template', () => {
		const card = buildNoticeCard('未绑定账号', '请先绑定', 'red');
		expect((card.header as Record<string, unknown>).template).toBe('red');
		expect(JSON.stringify(card)).toContain('未绑定账号');
	});
});

describe('buildProjectPickerCard', () => {
	const projects = [
		{ id: 'p1', name: 'Alpha', customerName: 'ACME' },
		{ id: 'p2', name: 'Beta', customerName: null }
	];

	it('renders a select_static carrying pick_project routing + project options', () => {
		const card = buildProjectPickerCard('doc-1', projects);
		const action = findByTag((card.elements as unknown), 'action');
		const select = ((action?.actions ?? []) as Array<Record<string, unknown>>)[0];
		expect(select.tag).toBe('select_static');
		expect(select.value).toEqual({ action: 'pick_project', document_id: 'doc-1' });
		const options = select.options as Array<{ value: string; text: { content: string } }>;
		expect(options.map((o) => o.value)).toEqual(['p1', 'p2']);
		expect(options[0].text.content).toContain('Alpha');
		expect(options[0].text.content).toContain('ACME');
	});

	it('caps options at 50 and notes truncation', () => {
		const many = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
		const card = buildProjectPickerCard('doc-1', many);
		const action = findByTag(card.elements as unknown, 'action');
		const select = ((action?.actions ?? []) as Array<Record<string, unknown>>)[0];
		expect((select.options as unknown[]).length).toBe(50);
		expect(JSON.stringify(card.elements)).toContain('仅显示前');
	});

	it('shows an explicit empty-state instead of an empty dropdown', () => {
		const card = buildProjectPickerCard('doc-1', []);
		const action = findByTag(card.elements as unknown, 'action');
		expect(action).toBeUndefined();
		expect(JSON.stringify(card.elements)).toContain('没有找到可选项目');
	});

	it('truncates long option labels for card rendering', () => {
		const card = buildProjectPickerCard('doc-1', [
			{ id: 'p1', name: 'A'.repeat(100), customerName: 'Customer' }
		]);
		const action = findByTag(card.elements as unknown, 'action');
		const select = ((action?.actions ?? []) as Array<Record<string, unknown>>)[0];
		const [option] = select.options as Array<{ text: { content: string } }>;
		expect(option.text.content.length).toBeLessThanOrEqual(80);
		expect(option.text.content.endsWith('...')).toBe(true);
	});
});

describe('buildEditableReviewCard', () => {
	const base = {
		documentId: 'doc-9',
		categoryId: 'expense.opex.transport',
		fileName: 'grab.pdf',
		documentType: 'receipt',
		fields: {
			amount: 23.5,
			currency: 'SGD',
			vendor: 'Grab',
			project_id: 'should-not-be-input',
			line_items: [{ description: 'ride' }]
		},
		confidence: { amount: 0.4 },
		projectId: 'p1',
		projectLabel: 'Alpha'
	};

	it('is a 2.0 form card with an input per scalar field (hiding project_id / arrays)', () => {
		const card = buildEditableReviewCard(base);
		expect(card.schema).toBe('2.0');
		const bodyElements = (card.body as Record<string, unknown>).elements as Array<
			Record<string, unknown>
		>;
		const form = bodyElements.find((e) => e.tag === 'form');
		expect(form).toBeTruthy();
		const formEls = form!.elements as Array<Record<string, unknown>>;
		const inputs = formEls.filter((e) => e.tag === 'input');
		const names = inputs.map((i) => i.name);
		expect(names).toContain('amount');
		expect(names).toContain('vendor');
		expect(names).not.toContain('project_id'); // hidden
		expect(names).not.toContain('line_items'); // arrays skipped
		// low-confidence amount flagged
		const amountInput = inputs.find((i) => i.name === 'amount');
		expect(JSON.stringify(amountInput?.label)).toContain('⚠️');
		expect(amountInput?.default_value).toBe('23.5');
	});

	it('approve button is a form_submit carrying document/category/project ids', () => {
		const card = buildEditableReviewCard(base);
		const json = JSON.stringify(card);
		expect(json).toContain('form_submit');
		const bodyElements = (card.body as Record<string, unknown>).elements as Array<
			Record<string, unknown>
		>;
		const form = bodyElements.find((e) => e.tag === 'form')!;
		const allButtons: Array<Record<string, unknown>> = [];
		const walk = (els: Array<Record<string, unknown>>) => {
			for (const el of els) {
				if (el.tag === 'button') allButtons.push(el);
				if (el.tag === 'column_set') {
					for (const col of el.columns as Array<Record<string, unknown>>) {
						walk(col.elements as Array<Record<string, unknown>>);
					}
				}
			}
		};
		walk(form.elements as Array<Record<string, unknown>>);
		const approve = allButtons.find((b) => (b.value as { action?: string })?.action === 'approve');
		expect(approve?.action_type).toBe('form_submit');
		expect(approve?.value).toEqual({
			action: 'approve',
			document_id: 'doc-9',
			category_id: 'expense.opex.transport',
			project_id: 'p1'
		});
		const reject = allButtons.find((b) => (b.value as { action?: string })?.action === 'reject');
		expect(reject?.value).toEqual({ action: 'reject', document_id: 'doc-9' });
	});
});
