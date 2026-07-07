/**
 * Lark interactive card for a QC checklist that arrived in Doc Hub and awaits
 * PM review. Shows project / supplier / file and offers Confirm / Reject.
 *
 * Platform layer — no `$modules/*` import (boundary rule 3). Button `value`s
 * carry only routing data (`{ action, record_id }`); the card-callback route
 * updates the Doc Hub record's status by that record_id.
 */

export interface QcReviewCardInput {
	/** Doc Hub record_id (Bitable). */
	recordId: string;
	projectName: string;
	supplierName: string;
	fileName: string;
	/** How the association was matched — e.g. "Link" (upload) / "Email". */
	source?: string;
	/** Match confidence — High / Medium / Low. Low → nudge PM to double-check. */
	confidence?: string;
}

export function buildQcReviewCard(input: QcReviewCardInput): Record<string, unknown> {
	const lowConf = input.confidence && input.confidence.toLowerCase() !== 'high';
	const fields = [
		{ is_short: true, text: { tag: 'lark_md', content: `**Project**\n${input.projectName || '—'}` } },
		{ is_short: true, text: { tag: 'lark_md', content: `**Supplier**\n${input.supplierName || '—'}` } },
		{ is_short: false, text: { tag: 'lark_md', content: `**File**\n${input.fileName}` } }
	];
	if (input.source || input.confidence) {
		fields.push({
			is_short: false,
			text: {
				tag: 'lark_md',
				content: `**Match**\n${input.source ?? '—'} · confidence ${input.confidence ?? '—'}${
					lowConf ? ' ⚠️ please double-check the project/supplier' : ''
				}`
			}
		});
	}

	return {
		config: { wide_screen_mode: true },
		header: {
			template: lowConf ? 'orange' : 'blue',
			title: { tag: 'plain_text', content: '🔍 QC checklist — please review' }
		},
		elements: [
			{ tag: 'div', fields },
			{ tag: 'hr' },
			{
				tag: 'action',
				actions: [
					{
						tag: 'button',
						text: { tag: 'plain_text', content: '✅ Confirm' },
						type: 'primary',
						value: { action: 'qc_confirm', record_id: input.recordId }
					},
					{
						tag: 'button',
						text: { tag: 'plain_text', content: '🚫 Reject' },
						type: 'danger',
						value: { action: 'qc_reject', record_id: input.recordId }
					}
				]
			}
		]
	};
}
