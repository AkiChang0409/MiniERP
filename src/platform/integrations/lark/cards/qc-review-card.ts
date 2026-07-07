/**
 * Lark interactive card (schema 2.0 form) for a QC checklist awaiting PM review.
 * Shows project / supplier / file, and lets the PM pick Category + File Type
 * (options pulled from the Doc Hub field definitions) before confirming. On
 * Confirm (form_submit) the callback receives `form_value` with the selections.
 *
 * Platform layer — no `$modules/*` import (boundary rule 3). Button `value`s
 * carry only routing data (`{ action, record_id }`).
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

	const elements: Array<Record<string, unknown>> = [
		{ tag: 'markdown', content: context },
		{ tag: 'hr' }
	];

	if (input.categoryOptions?.length) {
		elements.push({ tag: 'markdown', content: '**Category**' });
		elements.push(selectStatic('category', 'Select category…', input.categoryOptions));
	}
	if (input.fileTypeOptions?.length) {
		elements.push({ tag: 'markdown', content: '**File Type**' });
		elements.push(selectStatic('file_type', 'Select file type…', input.fileTypeOptions));
	}

	elements.push({
		tag: 'column_set',
		horizontal_spacing: 'default',
		columns: [
			{
				tag: 'column',
				width: 'weighted',
				weight: 1,
				elements: [
					{
						tag: 'button',
						text: { tag: 'plain_text', content: '✅ Confirm' },
						type: 'primary',
						action_type: 'form_submit',
						name: 'qc_confirm',
						value: { action: 'qc_confirm', record_id: input.recordId }
					}
				]
			},
			{
				tag: 'column',
				width: 'weighted',
				weight: 1,
				elements: [
					{
						tag: 'button',
						text: { tag: 'plain_text', content: '🚫 Reject' },
						type: 'danger',
						name: 'qc_reject',
						value: { action: 'qc_reject', record_id: input.recordId }
					}
				]
			}
		]
	});

	return {
		schema: '2.0',
		config: { wide_screen_mode: true, update_multi: true },
		header: {
			template: lowConf ? 'orange' : 'blue',
			title: { tag: 'plain_text', content: '🔍 QC checklist — please review' }
		},
		body: { elements }
	};
}
