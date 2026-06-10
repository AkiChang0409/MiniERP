// ---------------------------------------------------------------------------
// Expense Type & Category definitions
// Aligned with smartfin-expense-revenue-design.md
// ---------------------------------------------------------------------------

export const EXPENSE_CATEGORY_OPTIONS = {
	opex: [
		'transport',
		'accommodation',
		'meal',
		'gift',
		'allowance',
		'ai_subscription',
		'logistics',
		'purchase',
		'others'
	],
	sales_cost: ['invoice', 'receipt']
} as const;

export type ExpenseType = keyof typeof EXPENSE_CATEGORY_OPTIONS;
export type ExpenseCategory = (typeof EXPENSE_CATEGORY_OPTIONS)[ExpenseType][number];

export const EXPENSE_DOC_TYPES = ['invoice', 'receipt', 'po'] as const;
export type ExpenseDocType = (typeof EXPENSE_DOC_TYPES)[number];

export function isValidExpenseCategory(
	expenseType: string,
	category: string
): expenseType is ExpenseType {
	if (!(expenseType in EXPENSE_CATEGORY_OPTIONS)) return false;
	return (EXPENSE_CATEGORY_OPTIONS as Record<string, readonly string[]>)[expenseType].includes(
		category
	);
}

// ---------------------------------------------------------------------------
// Category → doc_type auto-mapping
// ---------------------------------------------------------------------------

export const CATEGORY_DOC_TYPE_MAP: Record<ExpenseCategory, ExpenseDocType | null> = {
	transport: 'receipt',
	accommodation: 'receipt',
	meal: 'receipt',
	gift: 'receipt',
	allowance: null,
	ai_subscription: 'invoice',
	logistics: 'receipt',
	purchase: 'po',
	invoice: 'invoice',
	receipt: 'receipt',
	others: null
};

// ---------------------------------------------------------------------------
// Category → default boolean flags
// ---------------------------------------------------------------------------

export const CATEGORY_DEFAULTS: Record<
	ExpenseCategory,
	{ reimbursement: boolean; businessTrip: boolean }
> = {
	transport: { reimbursement: true, businessTrip: false },
	accommodation: { reimbursement: true, businessTrip: true },
	meal: { reimbursement: true, businessTrip: false },
	gift: { reimbursement: false, businessTrip: false },
	allowance: { reimbursement: false, businessTrip: true },
	ai_subscription: { reimbursement: false, businessTrip: false },
	logistics: { reimbursement: false, businessTrip: false },
	purchase: { reimbursement: false, businessTrip: false },
	invoice: { reimbursement: false, businessTrip: false },
	receipt: { reimbursement: false, businessTrip: false },
	others: { reimbursement: false, businessTrip: false }
};

// ---------------------------------------------------------------------------
// Field definition type
// ---------------------------------------------------------------------------

export type FieldDef = {
	key: string;
	label: string;
	type: 'text' | 'number' | 'date';
	/** 'llm' = extracted by OCR/LLM from file, 'user' = must be filled by user */
	source: 'llm' | 'user';
};

// ---------------------------------------------------------------------------
// Category → scene-specific metadata fields (stored in metadata JSON)
//
// Common fields (date, amount, currency, vendor/supplier, gst_amount,
// staff_name, project_id) are already on the main form.
// Only scene-specific fields that go into the metadata column are listed here.
// Matches design doc section 4.4.
// ---------------------------------------------------------------------------

export const CATEGORY_METADATA_FIELDS: Record<string, FieldDef[]> = {
	transport: [
		{ key: 'receipt_number', label: 'Receipt No.', type: 'text', source: 'llm' }
	],
	accommodation: [
		// destination is handled via the business_trip boolean tag + destination field
	],
	meal: [
		{ key: 'receipt_number', label: 'Receipt No.', type: 'text', source: 'llm' }
	],
	gift: [
		{ key: 'receipt_number', label: 'Receipt No.', type: 'text', source: 'llm' },
		{ key: 'recipient', label: 'Recipient (gift recipient)', type: 'text', source: 'user' }
	],
	allowance: [],
	ai_subscription: [
		{ key: 'invoice_number', label: 'Invoice No.', type: 'text', source: 'llm' },
		{ key: 'due_date', label: 'Due Date', type: 'date', source: 'llm' },
		{ key: 'service_name', label: 'Service Name', type: 'text', source: 'llm' },
		{ key: 'period', label: 'Period (e.g. monthly)', type: 'text', source: 'llm' }
	],
	logistics: [
		{ key: 'receipt_number', label: 'Receipt/Invoice No.', type: 'text', source: 'llm' },
		{ key: 'tracking_number', label: 'Tracking No.', type: 'text', source: 'llm' }
	],
	purchase: [
		{ key: 'po_number', label: 'PO No.', type: 'text', source: 'llm' },
		{ key: 'description', label: 'Description (line item)', type: 'text', source: 'llm' }
	],
	invoice: [
		{ key: 'invoice_number', label: 'Invoice No.', type: 'text', source: 'llm' },
		{ key: 'due_date', label: 'Due Date', type: 'date', source: 'llm' }
	],
	receipt: [
		{ key: 'receipt_number', label: 'Receipt No.', type: 'text', source: 'llm' }
	],
	others: []
};

// ---------------------------------------------------------------------------
// Category → which common form fields to show (beyond the universal ones)
//
// Universal (always shown): date, amount, currency, notes, reimbursement, business_trip
// These flags control additional common fields per category.
// ---------------------------------------------------------------------------

export type CommonFieldVisibility = {
	vendorOrSupplier: boolean;
	staffName: boolean;
	gstAmount: boolean;
};

export const CATEGORY_COMMON_FIELDS: Record<string, CommonFieldVisibility> = {
	transport: { vendorOrSupplier: true, staffName: true, gstAmount: false },
	accommodation: { vendorOrSupplier: true, staffName: true, gstAmount: false },
	meal: { vendorOrSupplier: true, staffName: true, gstAmount: false },
	gift: { vendorOrSupplier: true, staffName: false, gstAmount: false },
	allowance: { vendorOrSupplier: false, staffName: true, gstAmount: false },
	ai_subscription: { vendorOrSupplier: true, staffName: false, gstAmount: true },
	logistics: { vendorOrSupplier: true, staffName: false, gstAmount: false },
	purchase: { vendorOrSupplier: true, staffName: false, gstAmount: false },
	invoice: { vendorOrSupplier: true, staffName: false, gstAmount: true },
	receipt: { vendorOrSupplier: true, staffName: false, gstAmount: true },
	others: { vendorOrSupplier: true, staffName: true, gstAmount: false }
};

// ---------------------------------------------------------------------------
// Upload form currency (single source of truth)
//
// The expense upload page <select> must use the same ISO codes. LLM/OCR often
// returns ¥, RMB, S$, etc.; normalize here so server + client bind cleanly.
//
// Deliberately NOT under `lib/currency/`: that would imply app-wide FX or
// treasury. If AR/tax later need the same rules, extract a thin
// `lib/finance/currency` and import EXPENSE_UPLOAD_CURRENCIES from this file.
// ---------------------------------------------------------------------------

export const EXPENSE_UPLOAD_CURRENCIES = ['SGD', 'USD', 'CNY', 'MYR', 'EUR'] as const;
export type ExpenseUploadCurrency = (typeof EXPENSE_UPLOAD_CURRENCIES)[number];

const EXPENSE_CURRENCY_ISO = new Set<string>(EXPENSE_UPLOAD_CURRENCIES);

/** Map common symbols/aliases to an allowed upload-form ISO code, or null. */
export function normalizeExpenseCurrency(input: string | null | undefined): ExpenseUploadCurrency | null {
	if (input == null || typeof input !== 'string') return null;
	const raw = input.normalize('NFKC').trim();
	if (!raw) return null;

	const upperSpaced = raw.toUpperCase().replace(/\s+/g, ' ').trim();
	const compact = upperSpaced.replace(/\s/g, '');

	if (EXPENSE_CURRENCY_ISO.has(compact)) return compact as ExpenseUploadCurrency;
	if (EXPENSE_CURRENCY_ISO.has(upperSpaced)) return upperSpaced as ExpenseUploadCurrency;

	if (/^US\$|^USD$|U\.S\.\s*DOLLAR|\bUS\s*DOLLAR\b/i.test(upperSpaced) || /^US\$/i.test(compact)) {
		return 'USD';
	}
	if (/^S\$|^SGD$|^SG\$|\bSINGAPORE\s+DOLLAR\b/i.test(upperSpaced) || /^S\$/i.test(compact)) {
		return 'SGD';
	}
	if (/^€|^EUR\b|\bEURO\b/i.test(upperSpaced) || raw.includes('€')) {
		return 'EUR';
	}
	if (/^RM\b|^MYR\b|\bRINGGIT\b/i.test(upperSpaced)) {
		return 'MYR';
	}

	if (/^[¥￥]$/.test(raw.trim())) {
		return 'CNY';
	}
	// Match CNY markers including Simplified/Traditional "renminbi" spellings (\u4EBA\u6C11\u5E01 / \u4EBA\u6C11\u5E63)
	if (/¥|￥|CN¥|CNY|RMB|\u4EBA\u6C11\u5E01|\u4EBA\u6C11\u5E63|\bRENMINBI\b/i.test(raw)) {
		return 'CNY';
	}
	if (/^RMB$|^CN¥$/i.test(compact)) {
		return 'CNY';
	}

	if (/^\$$/.test(raw.trim())) {
		return null;
	}

	return null;
}

/** Weak inference when the model omits currency; avoid multi-currency false positives. */
export function inferExpenseCurrencyFromText(text: string): ExpenseUploadCurrency | null {
	if (!text || text.length < 3) return null;
	const sample = text.slice(0, 80_000);

	const cny =
		/[¥￥]/.test(sample) ||
		/\bCNY\b/i.test(sample) ||
		/\bRMB\b/i.test(sample) ||
		/\u4EBA\u6C11\u5E01|\u4EBA\u6C11\u5E63/.test(sample);
	const usd = /\bUSD\b/i.test(sample) || /\bUS\$\b/.test(sample) || /U\.S\.\s*\$/i.test(sample);
	const sgd = /\bSGD\b/i.test(sample) || /S\$\s*[\d,.]/.test(sample);
	const eur = /\bEUR\b/i.test(sample) || /€/.test(sample);
	const myr = /\bMYR\b/i.test(sample) || /\bRM\b/.test(sample);

	const flags = [
		cny && 'CNY',
		usd && 'USD',
		sgd && 'SGD',
		eur && 'EUR',
		myr && 'MYR'
	].filter(Boolean) as ExpenseUploadCurrency[];

	if (flags.length === 1) {
		return flags[0]!;
	}
	if (cny && !usd && !sgd && !eur && !myr) {
		return 'CNY';
	}
	return null;
}

// ---------------------------------------------------------------------------
// Allowance daily rates by destination
// ---------------------------------------------------------------------------

export const ALLOWANCE_RATES: Record<string, number> = {
	china: 50,
	malaysia: 45
};

// ---------------------------------------------------------------------------
// Revenue invoice types
// ---------------------------------------------------------------------------

export const REVENUE_INVOICE_TYPES = ['standard', 'zero_rate', 'tax_invoice'] as const;
export type RevenueInvoiceType = (typeof REVENUE_INVOICE_TYPES)[number];

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
	opex: 'Operating Expenses',
	sales_cost: 'Sales Cost'
};

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
	transport: 'Transport',
	accommodation: 'Accommodation',
	meal: 'Meal',
	gift: 'Gift',
	allowance: 'Allowance',
	ai_subscription: 'AI/SaaS Subscription',
	logistics: 'Logistics',
	purchase: 'Purchase (PO)',
	others: 'Others',
	invoice: 'Invoice',
	receipt: 'Receipt'
};
