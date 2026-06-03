/**
 * Canonical category catalog for the financial-document-intake workflow.
 *
 * Source of truth: ref_files/smartfin-expense-revenue-design.md §4.4 (expense
 * categories), §5.3 (revenue / invoice_out), §8 (archive: contract /
 * quotation / purchase_order).
 *
 * This file lifts the scattered constants in
 * `src/modules/finance/schemas/expense-upload.ts` and the chip catalogues in
 * `src/modules/document-intake/schemas/intake-field-specs.ts` into a
 * single workflow-oriented table that the Finance Agent + capability layer +
 * UI all consume.
 *
 * The 11 expense categories + 1 revenue category + 3 document-only categories
 * each declare:
 *   - bucket / expense_type / category / doc_type triple (DB shape)
 *   - canonical LLM extraction field list (drives prompt construction)
 *   - user-supplied fields (drives review-step rendering)
 *   - default boolean flags (drives form pre-fill)
 *   - whether a document is required (false for allowance)
 *   - whether project linking is recommended (sales_cost / logistics)
 */

import type {
	ExpenseCategory,
	ExpenseDocType,
	ExpenseType
} from '$modules/finance/schemas/expense-upload';

export type Bucket = 'expense' | 'revenue' | 'document_only';

/** Document type label used by extraction (broader than ExpenseDocType �?adds invoice_out + archive types). */
export type CategoryDocType =
	| 'invoice'
	| 'receipt'
	| 'po'
	| 'invoice_out'
	| 'contract'
	| 'quotation'
	| 'purchase_order_doc'
	| null;

export interface DefaultFlags {
	reimbursement?: boolean;
	businessTrip?: boolean;
}

export interface CategoryDefinition {
	/** Stable id for the workflow state machine, e.g. `expense.opex.transport`. */
	id: string;
	bucket: Bucket;
	expenseType: ExpenseType | null;
	/** DB-shape category column for expenses (matches `EXPENSE_CATEGORY_OPTIONS`). null for non-expense buckets. */
	category: ExpenseCategory | null;
	/** DB-shape doc_type. null for allowance + revenue + archive (those use `categoryDocType`). */
	expenseDocType: ExpenseDocType | null;
	/** Broader doc-type label spanning expense + revenue + archive. Drives prompt selection. */
	categoryDocType: CategoryDocType;

	label: string;
	sublabel?: string;
	group?: string;

	/** Canonical LLM extraction field names. Drives the per-category prompt. */
	llmFields: string[];
	/** Fields the user fills (LLM cannot extract, or business-only). */
	userFields: string[];

	defaultFlags: DefaultFlags;
	/** Recommended (or required) project link. */
	requiresProject: boolean;
	/** Whether the workflow expects a file. False for allowance. */
	hasDocument: boolean;
	/** Persistence routing �?which DB table this category lands in. */
	persistTarget: 'expenses' | 'revenue' | 'contracts' | 'quotations' | 'purchase_orders';
}

// ---------------------------------------------------------------------------
// Common LLM field bundles, keyed by document type
// ---------------------------------------------------------------------------

const RECEIPT_LLM = ['receipt_number', 'date', 'amount', 'currency', 'vendor'];
const INVOICE_LLM = [
	'invoice_number',
	'supplier_name',
	'date',
	'due_date',
	'amount',
	'currency',
	'gst_amount'
];
const PO_LLM = ['po_number', 'supplier_name', 'date', 'amount', 'currency', 'description'];

// ---------------------------------------------------------------------------
// Category catalog �?11 expense + 1 revenue + 3 archive
// ---------------------------------------------------------------------------

const EXPENSE_CATEGORIES: CategoryDefinition[] = [
	// ----- Sales Cost (project-linked) -----
	{
		id: 'expense.sales_cost.invoice',
		bucket: 'expense',
		expenseType: 'sales_cost',
		category: 'invoice',
		expenseDocType: 'invoice',
		categoryDocType: 'invoice',
		label: 'Supplier invoice',
		sublabel: 'Vendor bill for project work',
		group: 'Project cost',
		llmFields: INVOICE_LLM,
		userFields: ['project_id'],
		defaultFlags: {},
		requiresProject: true,
		hasDocument: true,
		persistTarget: 'expenses'
	},
	{
		id: 'expense.sales_cost.receipt',
		bucket: 'expense',
		expenseType: 'sales_cost',
		category: 'receipt',
		expenseDocType: 'receipt',
		categoryDocType: 'receipt',
		label: 'Payment receipt',
		sublabel: 'Confirmation of payment',
		group: 'Project cost',
		llmFields: [...RECEIPT_LLM, 'recipient_name', 'gst_amount'],
		userFields: ['project_id'],
		defaultFlags: {},
		requiresProject: true,
		hasDocument: true,
		persistTarget: 'expenses'
	},

	// ----- OPEX �?Staff cost -----
	{
		id: 'expense.opex.transport',
		bucket: 'expense',
		expenseType: 'opex',
		category: 'transport',
		expenseDocType: 'receipt',
		categoryDocType: 'receipt',
		label: 'Transport',
		sublabel: 'Grab, taxi, MRT',
		group: 'Operating cost',
		llmFields: [...RECEIPT_LLM, 'recipient_name'],
		userFields: ['reimbursement', 'business_trip', 'project_id'],
		defaultFlags: { reimbursement: true, businessTrip: false },
		requiresProject: false,
		hasDocument: true,
		persistTarget: 'expenses'
	},
	{
		id: 'expense.opex.accommodation',
		bucket: 'expense',
		expenseType: 'opex',
		category: 'accommodation',
		expenseDocType: 'receipt',
		categoryDocType: 'receipt',
		label: 'Accommodation',
		sublabel: 'Hotel / lodging',
		group: 'Operating cost',
		llmFields: ['date', 'amount', 'currency', 'vendor', 'destination'],
		userFields: ['business_trip', 'reimbursement', 'project_id'],
		defaultFlags: { reimbursement: true, businessTrip: true },
		requiresProject: false,
		hasDocument: true,
		persistTarget: 'expenses'
	},
	{
		id: 'expense.opex.meal',
		bucket: 'expense',
		expenseType: 'opex',
		category: 'meal',
		expenseDocType: 'receipt',
		categoryDocType: 'receipt',
		label: 'Meal',
		sublabel: 'Food & drinks',
		group: 'Operating cost',
		llmFields: [...RECEIPT_LLM, 'staff_name'],
		userFields: ['reimbursement', 'business_trip', 'project_id'],
		defaultFlags: { reimbursement: true, businessTrip: false },
		requiresProject: false,
		hasDocument: true,
		persistTarget: 'expenses'
	},
	{
		id: 'expense.opex.gift',
		bucket: 'expense',
		expenseType: 'opex',
		category: 'gift',
		expenseDocType: 'receipt',
		categoryDocType: 'receipt',
		label: 'Gift',
		sublabel: 'Client / staff gift',
		group: 'Operating cost',
		llmFields: RECEIPT_LLM,
		userFields: ['recipient', 'project_id'],
		defaultFlags: {},
		requiresProject: false,
		hasDocument: true,
		persistTarget: 'expenses'
	},
	{
		id: 'expense.opex.allowance',
		bucket: 'expense',
		expenseType: 'opex',
		category: 'allowance',
		expenseDocType: null,
		categoryDocType: null,
		label: 'Allowance',
		sublabel: 'Per-diem, no file',
		group: 'Operating cost',
		llmFields: [],
		userFields: [
			'staff_name',
			'destination',
			'date_start',
			'date_end',
			'days',
			'daily_rate',
			'total'
		],
		defaultFlags: { businessTrip: true },
		requiresProject: false,
		hasDocument: false,
		persistTarget: 'expenses'
	},

	// ----- OPEX �?Company cost -----
	{
		id: 'expense.opex.ai_subscription',
		bucket: 'expense',
		expenseType: 'opex',
		category: 'ai_subscription',
		expenseDocType: 'invoice',
		categoryDocType: 'invoice',
		label: 'SaaS / AI sub',
		sublabel: 'ChatGPT, Cursor, etc.',
		group: 'Operating cost',
		llmFields: [...INVOICE_LLM, 'service_name', 'period'],
		userFields: [],
		defaultFlags: {},
		requiresProject: false,
		hasDocument: true,
		persistTarget: 'expenses'
	},
	{
		id: 'expense.opex.logistics',
		bucket: 'expense',
		expenseType: 'opex',
		category: 'logistics',
		expenseDocType: 'receipt',
		categoryDocType: 'receipt',
		label: 'Logistics',
		sublabel: 'Courier, shipping',
		group: 'Operating cost',
		llmFields: [...RECEIPT_LLM, 'tracking_number'],
		userFields: ['project_id'],
		defaultFlags: {},
		requiresProject: false,
		hasDocument: true,
		persistTarget: 'expenses'
	},
	{
		id: 'expense.opex.purchase',
		bucket: 'expense',
		expenseType: 'opex',
		category: 'purchase',
		expenseDocType: 'po',
		categoryDocType: 'po',
		label: 'Procurement',
		sublabel: 'BOM / PO purchase',
		group: 'Operating cost',
		llmFields: PO_LLM,
		userFields: ['project_id'],
		defaultFlags: {},
		requiresProject: false,
		hasDocument: true,
		persistTarget: 'expenses'
	},
	{
		id: 'expense.opex.others',
		bucket: 'expense',
		expenseType: 'opex',
		category: 'others',
		expenseDocType: 'receipt',
		categoryDocType: 'receipt',
		label: 'Others',
		sublabel: 'Anything else',
		group: 'Operating cost',
		llmFields: RECEIPT_LLM,
		userFields: ['project_id'],
		defaultFlags: {},
		requiresProject: false,
		hasDocument: true,
		persistTarget: 'expenses'
	}
];

const REVENUE_CATEGORIES: CategoryDefinition[] = [
	{
		id: 'revenue.invoice_out',
		bucket: 'revenue',
		expenseType: null,
		category: null,
		expenseDocType: null,
		categoryDocType: 'invoice_out',
		label: 'Customer invoice',
		sublabel: 'Standard / GST / zero-rate',
		llmFields: [
			'invoice_number',
			'invoice_date',
			'invoice_due_date',
			'invoice_currency',
			'invoice_amount',
			'invoice_gst_amount',
			'customer_name',
			'po_number',
			'invoice_subtotal'
		],
		userFields: ['invoice_type', 'project_id', 'notes'],
		defaultFlags: {},
		requiresProject: false,
		hasDocument: true,
		persistTarget: 'revenue'
	}
];

const ARCHIVE_CATEGORIES: CategoryDefinition[] = [
	{
		id: 'document_only.contract',
		bucket: 'document_only',
		expenseType: null,
		category: null,
		expenseDocType: null,
		categoryDocType: 'contract',
		label: 'Contract',
		sublabel: 'Agreement doc',
		llmFields: [
			'contract_number',
			'client_name',
			'effective_date',
			'expiry_date',
			'amount',
			'currency',
			'payment_terms',
			'scope'
		],
		userFields: ['type', 'project_id', 'status', 'notes'],
		defaultFlags: {},
		requiresProject: false,
		hasDocument: true,
		persistTarget: 'contracts'
	},
	{
		id: 'document_only.quotation',
		bucket: 'document_only',
		expenseType: null,
		category: null,
		expenseDocType: null,
		categoryDocType: 'quotation',
		label: 'Quotation',
		sublabel: 'Quote / proposal',
		llmFields: [
			'quotation_number',
			'client_name',
			'date',
			'valid_until',
			'amount',
			'currency',
			'line_items'
		],
		userFields: ['project_id', 'status', 'notes'],
		defaultFlags: {},
		requiresProject: false,
		hasDocument: true,
		persistTarget: 'quotations'
	},
	{
		id: 'document_only.purchase_order',
		bucket: 'document_only',
		expenseType: null,
		category: null,
		expenseDocType: null,
		categoryDocType: 'purchase_order_doc',
		label: 'Purchase order',
		sublabel: 'PO doc',
		llmFields: [
			'po_number',
			'supplier_name',
			'client_name',
			'date',
			'amount',
			'currency',
			'description',
			'line_items'
		],
		userFields: ['project_id', 'status', 'notes'],
		defaultFlags: {},
		requiresProject: false,
		hasDocument: true,
		persistTarget: 'purchase_orders'
	}
];

export const FINANCE_CATEGORY_CATALOG: CategoryDefinition[] = [
	...EXPENSE_CATEGORIES,
	...REVENUE_CATEGORIES,
	...ARCHIVE_CATEGORIES
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function findCategoryById(id: string): CategoryDefinition | undefined {
	return FINANCE_CATEGORY_CATALOG.find((c) => c.id === id);
}

/** Document-type enum value used by the intake artifact (`documentArtifacts.documentType`). */
export type IntakeDocumentType =
	| 'supplier_invoice'
	| 'customer_invoice'
	| 'receipt'
	| 'purchase_order'
	| 'contract'
	| 'quotation'
	| 'bank_statement'
	| 'tax_document'
	| 'logistics_document'
	| 'unknown';

/**
 * Reverse of {@link categoryIdForDocumentType}: derive the coarse intake
 * `documentType` from a (finer) finance category. With category-first
 * classification the category is the source of truth; `documentType` is kept
 * only as a coarse display label, derived here from the category's
 * `categoryDocType`.
 */
export function documentTypeForCategory(
	categoryId: string | null | undefined
): IntakeDocumentType {
	const cat = categoryId ? findCategoryById(categoryId) : undefined;
	switch (cat?.categoryDocType) {
		case 'invoice':
			return 'supplier_invoice';
		case 'invoice_out':
			return 'customer_invoice';
		case 'receipt':
			return 'receipt';
		case 'po':
		case 'purchase_order_doc':
			return 'purchase_order';
		case 'contract':
			return 'contract';
		case 'quotation':
			return 'quotation';
		default:
			return 'unknown';
	}
}

export function getCategoriesByBucket(bucket: Bucket): CategoryDefinition[] {
	return FINANCE_CATEGORY_CATALOG.filter((c) => c.bucket === bucket);
}

export function findCategoryByExpenseTuple(
	expenseType: ExpenseType,
	category: ExpenseCategory
): CategoryDefinition | undefined {
	return FINANCE_CATEGORY_CATALOG.find(
		(c) => c.bucket === 'expense' && c.expenseType === expenseType && c.category === category
	);
}

/**
 * Phase-1 vendor-invoice-intake hardcoded `expense_type='opex'` /
 * `category='purchase'`. The right canonical default for "user dropped a
 * supplier invoice" is `sales_cost.invoice` (project-linked). Keeping a
 * helper so callers can update without scattering literals.
 */
export const DEFAULT_SUPPLIER_INVOICE_CATEGORY_ID = 'expense.sales_cost.invoice';

/** Default category when the classifier produces no useful guess. */
export const FALLBACK_CATEGORY_ID = 'expense.opex.others';

/**
 * Maps a classifier-emitted `documentType` to the canonical category id the
 * field-extraction capability should use as its prompt/schema target.
 *
 * Used by the async document-processor worker (Ship 2): after the artifact is
 * `classified`, the worker looks up a default categoryId here, then calls
 * `extract-document-fields` against that category's `llmFields`. Returning
 * `null` signals "we don't know enough to auto-extract — let the user pick a
 * category in the inbox first" (the worker will leave the artifact in
 * `ready_for_review` with no `suggestedFields`).
 *
 * Mapping rationale:
 * - `supplier_invoice` → sales_cost.invoice (project-linked default; matches
 *   DEFAULT_SUPPLIER_INVOICE_CATEGORY_ID)
 * - `receipt` → opex.others (generic fallback; user can re-pick a more
 *   specific opex category like meal/transport in the inbox)
 * - `customer_invoice` → revenue.invoice_out (only revenue category that
 *   exists today)
 * - `purchase_order` / `contract` / `quotation` → matching document_only
 *   categories (no expenses/revenue write, archive-only)
 * - `bank_statement` / `tax_document` / `logistics_document` / `unknown` →
 *   null. Bank statements & tax docs have no canonical category yet;
 *   logistics is ambiguous (could be sales_cost or opex.logistics depending
 *   on context) so we defer to user.
 */
export function categoryIdForDocumentType(
	documentType:
		| 'supplier_invoice'
		| 'receipt'
		| 'purchase_order'
		| 'customer_invoice'
		| 'logistics_document'
		| 'contract'
		| 'quotation'
		| 'bank_statement'
		| 'tax_document'
		| 'unknown'
): string | null {
	switch (documentType) {
		case 'supplier_invoice':
			return DEFAULT_SUPPLIER_INVOICE_CATEGORY_ID;
		case 'receipt':
			return FALLBACK_CATEGORY_ID;
		case 'customer_invoice':
			return 'revenue.invoice_out';
		case 'purchase_order':
			return 'document_only.purchase_order';
		case 'contract':
			return 'document_only.contract';
		case 'quotation':
			return 'document_only.quotation';
		case 'bank_statement':
		case 'tax_document':
		case 'logistics_document':
		case 'unknown':
			return null;
	}
}

