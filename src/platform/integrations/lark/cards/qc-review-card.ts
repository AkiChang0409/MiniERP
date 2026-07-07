/**
 * Lark interactive card (schema 2.0) for a QC checklist awaiting PM review.
 * Shows project / supplier / file with Confirm / Reject buttons.
 *
 * Classification (Category / File Type) is intentionally NOT done here: those are
 * relation (Link) fields with a native cascading picker in the Doc Hub table,
 * which a message card can't replicate. The PM classifies in the record itself;
 * this card only drives the status (Effective / Rejected).
 *
 * Card 2.0: buttons are `form_submit` inside a `form` (the only 2.0-valid way to
 * carry a callback from a button group here). Platform layer — no `$modules/*`.
 */

export interface QcReviewCardInput {
	/** Doc Hub record_id (Bitable). */
	recordId: string;
	projectName: string;
	supplierName: string;
	fileName: string;
	source?: string;
	confidence?: string;
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

	const btn = (content: string, type: string, action: string) => ({
		tag: 'button',
		text: { tag: 'plain_text', content },
		type,
		action_type: 'form_submit',
		name: action,
		value: { action, record_id: input.recordId }
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
				{ tag: 'markdown', content: '_Set Category / File Type in the record; confirm here._' },
				{ tag: 'hr' },
				{
					tag: 'form',
					name: 'qc_form',
					elements: [
						{
							tag: 'column_set',
							horizontal_spacing: 'default',
							columns: [
								{ tag: 'column', width: 'weighted', weight: 1, elements: [btn('✅ Confirm', 'primary', 'qc_confirm')] },
								{ tag: 'column', width: 'weighted', weight: 1, elements: [btn('🚫 Reject', 'danger', 'qc_reject')] }
							]
						}
					]
				}
			]
		}
	};
}
