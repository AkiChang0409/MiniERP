/**
 * Lark interactive card (schema 2.0 form) for a QC checklist awaiting PM review.
 * Shows project / supplier / file, and lets the PM pick Category + File Type
 * (options pulled from the Doc Hub field definitions) before confirming.
 *
 * Card 2.0 rule: a `form_submit` button must live inside a `form` container, and
 * the named inputs it collects must be inside that same form. So the selects +
 * Confirm live in a `form`; Reject is a plain callback button outside it.
 *
 * Platform layer — no `$modules/*` import (boundary rule 3). Button `value`s
 * carry only routing data (`{ action, record_id }`); selections ride in
 * `form_value` keyed by each select's `name`.
 */

export interface QcReviewCardInput {
	/** Doc Hub record_id (Bitable). */
	recordId: string;
	projectName: string;
	supplierName: string;
	fileName: string;
	source?: string;
	confidence?: string;
	/** Single-select option labels from the Doc Hub `Category` / `File Type` fields. */
	categoryOptions?: string[];
	fileTypeOptions?: string[];
}

const MAX_OPTIONS = 50; // Lark select_static caps; File Type can have many.

function selectStatic(name: string, placeholder: string, options: string[]): Record<string, unknown> {
	return {
		tag: 'select_static',
		name,
		placeholder: { tag: 'plain_text', content: placeholder },
		options: options.slice(0, MAX_OPTIONS).map((o) => ({
			text: { tag: 'plain_text', content: o },
			value: o
		}))
	};
}

export function buildQcReviewCard(input: QcReviewCardInput): Record<string, unknown> {
	const lowConf = input.confidence && input.confidence.toLowerCase() !== 'high';

	const context = [
		`**Project**: ${input.projectName || '—'}`,
		`**Supplier**: ${input.supplierName || '—'}`,
		`**File**: ${input.fileName}`,
		input.source || input.confidence
			? `**Match**: ${input.source ?? '—'} · confidence ${input.confidence ?? '—'}${
					lowConf ? ' ⚠️ please double-check' : ''
				}`
			: ''
	]
		.filter(Boolean)
		.join('\n');

	// Card 2.0: no `action` tag. Both buttons are `form_submit` inside the form
	// (reject just ignores the form_value). Selects must be in the same form.
	const btn = (content: string, type: string, action: string) => ({
		tag: 'button',
		text: { tag: 'plain_text', content },
		type,
		action_type: 'form_submit',
		name: action,
		value: { action, record_id: input.recordId }
	});

	const formElements: Array<Record<string, unknown>> = [];
	if (input.categoryOptions?.length) {
		formElements.push(selectStatic('category', 'Category — select…', input.categoryOptions));
	}
	if (input.fileTypeOptions?.length) {
		formElements.push(selectStatic('file_type', 'File Type — select…', input.fileTypeOptions));
	}
	formElements.push({
		tag: 'column_set',
		horizontal_spacing: 'default',
		columns: [
			{ tag: 'column', width: 'weighted', weight: 1, elements: [btn('✅ Confirm', 'primary', 'qc_confirm')] },
			{ tag: 'column', width: 'weighted', weight: 1, elements: [btn('🚫 Reject', 'danger', 'qc_reject')] }
		]
	});

	return {
		schema: '2.0',
		config: { wide_screen_mode: true, update_multi: true },
		header: {
			template: lowConf ? 'orange' : 'blue',
			title: { tag: 'plain_text', content: '🔍 QC checklist — please review' }
		},
		body: {
			elements: [
				{ tag: 'markdown', content: context },
				{ tag: 'hr' },
				{ tag: 'form', name: 'qc_form', elements: formElements }
			]
		}
	};
}
