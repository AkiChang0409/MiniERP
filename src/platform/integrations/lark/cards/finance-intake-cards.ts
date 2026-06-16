/**
 * Lark (Feishu) cards for the conversational finance document-intake flow:
 *   1. upload prompt  (after the user clicks the "财务文件录入" menu)
 *   2. project picker  (after the file is stored — a select_static dropdown)
 *   3. editable review (after OCR/extract — a form card the user can edit, then
 *      Approve / Reject)
 *
 * Self-contained platform-layer code: no `$modules/*` imports (boundary rule 3).
 * Field-label prettifying is reused from `intake-review-card.ts`. Action button
 * `value`s carry only routing data; field values come back via the form_value
 * payload on submit, and the server re-resolves the user from the open_id.
 *
 * Card versions: upload-prompt + project-picker use card 1.0 (`{config,header,
 * elements}`); the editable review card uses card 2.0 (`{schema:'2.0',...,body}`)
 * because input/form components are a 2.0 feature. Exact 2.0 field names may need
 * tweaking against a live Lark client (see plan "已知风险").
 */
import { prettifyKey, prettifyCategory } from './intake-review-card';

export interface ProjectOption {
	id: string;
	name: string;
	customerName?: string | null;
}

/** Card shown right after the menu click — asks the user to send a document. */
export function buildUploadPromptCard(): Record<string, unknown> {
	return {
		config: { wide_screen_mode: true },
		header: {
			template: 'blue',
			title: { tag: 'plain_text', content: '📄 财务文件录入' }
		},
		elements: [
			{
				tag: 'div',
				text: {
					tag: 'lark_md',
					content: '请直接发送一张**财务单据**（发票 / 收据 / PDF 或图片）给我，我来识别并帮你录入。'
				}
			}
		]
	};
}

/** Plain notice card (card 1.0) — used for transient states like "正在识别…". */
export function buildNoticeCard(title: string, content: string, template = 'blue'): Record<string, unknown> {
	return {
		config: { wide_screen_mode: true },
		header: { template, title: { tag: 'plain_text', content: title } },
		elements: [{ tag: 'div', text: { tag: 'lark_md', content } }]
	};
}

/**
 * Project picker: a select_static dropdown. On selection Lark fires
 * card.action.trigger with `event.action.option` = chosen projectId and
 * `event.action.value` = `{ action:'pick_project', document_id }`.
 */
const MAX_PROJECT_OPTIONS = 50;

export function buildProjectPickerCard(
	documentId: string,
	projects: ProjectOption[]
): Record<string, unknown> {
	const options = projects.slice(0, MAX_PROJECT_OPTIONS).map((p) => ({
		text: {
			tag: 'plain_text',
			content: p.customerName ? `${p.name} · ${p.customerName}` : p.name
		},
		value: p.id
	}));
	const truncated = projects.length > MAX_PROJECT_OPTIONS;

	const elements: Array<Record<string, unknown>> = [
		{
			tag: 'div',
			text: { tag: 'lark_md', content: '单据已收到 ✅。请选择要归入的**项目**：' }
		},
		{
			tag: 'action',
			actions: [
				{
					tag: 'select_static',
					placeholder: { tag: 'plain_text', content: '选择项目' },
					value: { action: 'pick_project', document_id: documentId },
					options
				}
			]
		}
	];
	if (truncated) {
		elements.push({
			tag: 'note',
			elements: [
				{ tag: 'plain_text', content: `仅显示前 ${MAX_PROJECT_OPTIONS} 个项目，其余请在 App 中处理。` }
			]
		});
	}

	return {
		config: { wide_screen_mode: true },
		header: { template: 'blue', title: { tag: 'plain_text', content: '🗂️ 选择项目' } },
		elements
	};
}

/** Keys never shown as editable inputs (handled elsewhere or noise). */
const NON_EDITABLE_KEYS = new Set(['project_id', 'projectId', 'line_items', 'lineItems', 'invoiceLineItems']);
const MAX_INPUT_FIELDS = 12;

function stringifyValue(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'object') return '';
	return String(value);
}

export interface EditableReviewCardInput {
	documentId: string;
	categoryId: string | null;
	fileName: string;
	documentType?: string;
	fields: Record<string, unknown>;
	confidence?: Record<string, number>;
	/** Project the flow already pinned — embedded in the approve action + shown. */
	projectId?: string;
	projectLabel?: string;
}

/**
 * Editable field-review card (card 2.0 form). Each scalar extracted field
 * becomes an `input` named by its field key; Approve is a `form_submit` button
 * so the callback receives `event.action.form_value` with the edited values.
 */
export function buildEditableReviewCard(input: EditableReviewCardInput): Record<string, unknown> {
	const categoryLabel = prettifyCategory(input.categoryId, input.documentType);

	const inputs: Array<Record<string, unknown>> = [];
	for (const [key, raw] of Object.entries(input.fields)) {
		if (NON_EDITABLE_KEYS.has(key)) continue;
		if (raw !== null && typeof raw === 'object') continue; // skip arrays/objects
		const conf = input.confidence?.[key];
		const lowConf = typeof conf === 'number' && conf < 0.5 ? ' ⚠️' : '';
		inputs.push({
			tag: 'input',
			name: key,
			label: { tag: 'plain_text', content: `${prettifyKey(key)}${lowConf}` },
			default_value: stringifyValue(raw),
			placeholder: { tag: 'plain_text', content: prettifyKey(key) }
		});
		if (inputs.length >= MAX_INPUT_FIELDS) break;
	}

	const contextLines = [`**类别**：${categoryLabel}`];
	if (input.projectLabel) contextLines.push(`**项目**：${input.projectLabel}`);

	const formElements: Array<Record<string, unknown>> = [
		...inputs,
		{
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
							text: { tag: 'plain_text', content: '✅ 确认入库' },
							type: 'primary',
							action_type: 'form_submit',
							name: 'approve',
							value: {
								action: 'approve',
								document_id: input.documentId,
								category_id: input.categoryId ?? '',
								project_id: input.projectId ?? ''
							}
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
							text: { tag: 'plain_text', content: '🚫 放弃' },
							type: 'danger',
							name: 'reject',
							value: { action: 'reject', document_id: input.documentId }
						}
					]
				}
			]
		}
	];

	return {
		schema: '2.0',
		config: { wide_screen_mode: true, update_multi: true },
		header: {
			template: 'blue',
			title: { tag: 'plain_text', content: `📝 复核字段：${input.fileName}` }
		},
		body: {
			elements: [
				{ tag: 'markdown', content: contextLines.join('\n') },
				{ tag: 'hr' },
				{
					tag: 'form',
					name: 'intake_form',
					elements: formElements
				}
			]
		}
	};
}
