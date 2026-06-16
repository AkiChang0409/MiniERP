/**
 * Builds the Lark (Feishu) interactive card for an inbox document that reached
 * `ready_for_review`. The card shows the AI-extracted fields read-only and
 * offers Confirm / Reject / Open-in-app.
 *
 * Deliberately self-contained: this lives in the platform layer and must not
 * import any `$modules/*` (boundary rule 3). It works off a plain input shape;
 * the document-intake notifier maps its `DocumentArtifact` onto it. Whether a
 * category requires a project (and so cannot be confirmed from the card) is
 * decided downstream in the card-callback route, which may import finance.
 *
 * Card action button `value`s carry only stringly-typed routing data
 * (`{ action, document_id, category_id }`) — the callback reloads the artifact
 * server-side and rebuilds the field values, so nothing sensitive rides on the
 * card or the click payload.
 */

export interface IntakeReviewCardInput {
	documentId: string;
	fileName: string;
	/** `suggestedCategoryId`, e.g. `expense.opex.transport`. May be null. */
	categoryId: string | null;
	/** Classifier `documentType`, e.g. `receipt`. Used for the subtitle. */
	documentType?: string;
	/** `suggestedFields.fields` — snake_case or camelCase keys → values. */
	fields: Record<string, unknown>;
	/** `suggestedFields.confidence` — keyed like `fields`. */
	confidence?: Record<string, number>;
	/** Base URL of the app, e.g. https://smartfin-v4.aki-wang.workers.dev. */
	appBaseUrl: string;
}

/** Compact label map, mirroring InboxConfirmForm's FIELD_META (no .svelte import). */
const FIELD_LABELS: Record<string, string> = {
	invoice_number: 'Invoice number',
	receipt_number: 'Receipt number',
	po_number: 'PO number',
	contract_number: 'Contract number',
	quotation_number: 'Quotation number',
	supplier_name: 'Supplier',
	vendor: 'Vendor',
	recipient_name: 'Recipient',
	staff_name: 'Staff name',
	customer_name: 'Customer',
	client_name: 'Client',
	date: 'Date',
	due_date: 'Due date',
	effective_date: 'Effective date',
	expiry_date: 'Expiry date',
	valid_until: 'Valid until',
	invoice_date: 'Invoice date',
	amount: 'Amount',
	total: 'Total',
	gst_amount: 'GST amount',
	invoice_amount: 'Invoice amount',
	currency: 'Currency',
	destination: 'Destination',
	service_name: 'Service name',
	period: 'Period',
	tracking_number: 'Tracking number',
	description: 'Description',
	scope: 'Scope',
	payment_terms: 'Payment terms',
	line_items: 'Line items',
	reimbursement: 'Reimbursement',
	business_trip: 'Business trip',
	invoice_type: 'Invoice type',
	notes: 'Notes'
};

/** Keys that are noise on a review card or rendered specially. */
const HIDDEN_KEYS = new Set(['project_id', 'projectId']);
const MAX_FIELDS = 14;

function prettifyKey(key: string): string {
	const snake = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
	return (
		FIELD_LABELS[snake] ??
		FIELD_LABELS[key] ??
		snake.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
	);
}

/** Human-readable category label from a dotted category id. */
function prettifyCategory(categoryId: string | null, documentType?: string): string {
	if (categoryId) {
		const leaf = categoryId.split('.').pop() ?? categoryId;
		return leaf.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}
	if (documentType && documentType !== 'unknown') {
		return documentType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}
	return '未识别';
}

function formatValue(value: unknown): string | null {
	if (value === null || value === undefined || value === '') return null;
	if (Array.isArray(value)) {
		return value.length ? `${value.length} 项` : null;
	}
	if (typeof value === 'boolean') return value ? '是' : '否';
	if (typeof value === 'object') return null;
	const str = String(value).trim();
	return str ? str : null;
}

/** Lark `div.fields` entries, two-up, for the extracted values. */
function buildFieldEntries(input: IntakeReviewCardInput): Array<Record<string, unknown>> {
	const entries: Array<Record<string, unknown>> = [];
	for (const [key, raw] of Object.entries(input.fields)) {
		if (HIDDEN_KEYS.has(key)) continue;
		const value = formatValue(raw);
		if (value === null) continue;
		const conf = input.confidence?.[key];
		const lowConf = typeof conf === 'number' && conf < 0.5 ? ' ⚠️' : '';
		const isLong = key === 'description' || key === 'scope' || key === 'line_items' || value.length > 24;
		entries.push({
			is_short: !isLong,
			text: { tag: 'lark_md', content: `**${prettifyKey(key)}**${lowConf}\n${value}` }
		});
		if (entries.length >= MAX_FIELDS) break;
	}
	return entries;
}

export function buildIntakeReviewCard(input: IntakeReviewCardInput): Record<string, unknown> {
	const categoryLabel = prettifyCategory(input.categoryId, input.documentType);
	const fieldEntries = buildFieldEntries(input);
	const appUrl = input.appBaseUrl.replace(/\/+$/, '');
	const openUrl = `${appUrl}/finance/inbox/${encodeURIComponent(input.documentId)}`;

	const elements: Array<Record<string, unknown>> = [
		{
			tag: 'div',
			text: { tag: 'lark_md', content: `**类别**：${categoryLabel}` }
		},
		{ tag: 'hr' }
	];

	if (fieldEntries.length > 0) {
		elements.push({ tag: 'div', fields: fieldEntries });
	} else {
		elements.push({
			tag: 'div',
			text: { tag: 'lark_md', content: '_未抽取到可展示字段，请在 App 中查看。_' }
		});
	}

	elements.push({ tag: 'hr' });
	elements.push({
		tag: 'action',
		actions: [
			{
				tag: 'button',
				text: { tag: 'plain_text', content: '✅ Confirm' },
				type: 'primary',
				value: { action: 'confirm', document_id: input.documentId, category_id: input.categoryId ?? '' }
			},
			{
				tag: 'button',
				text: { tag: 'plain_text', content: '🚫 Reject' },
				type: 'danger',
				value: { action: 'reject', document_id: input.documentId }
			},
			{
				tag: 'button',
				text: { tag: 'plain_text', content: '在 App 中打开' },
				type: 'default',
				url: openUrl
			}
		]
	});

	return {
		config: { wide_screen_mode: true },
		header: {
			template: 'blue',
			title: { tag: 'plain_text', content: `📄 待确认：${input.fileName}` }
		},
		elements
	};
}

/** A minimal result card used to replace the original after Confirm/Reject. */
export function buildResultCard(
	title: string,
	content: string,
	template: 'green' | 'red' | 'grey' = 'green'
): Record<string, unknown> {
	return {
		config: { wide_screen_mode: true },
		header: { template, title: { tag: 'plain_text', content: title } },
		elements: [{ tag: 'div', text: { tag: 'lark_md', content } }]
	};
}
