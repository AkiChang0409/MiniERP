/**
 * Finance agent raw read tools (P3 read-from-Bitable).
 *
 * Plain DATA tools that read the Bitable mirror (source of truth) for the
 * finance ledgers and return normalized records; the unified agent loop composes
 * the answer. Kept separate from the typed `FinanceCapability` family (which
 * carries deps + descriptors) — these are simple `PlatformCapability` reads,
 * registered for `finance-agent` under `finance:view`.
 *
 * Table ids come from the Bitable registry (identifiers, not secrets).
 */
import { z } from 'zod';
import { readBitableRecords, normalizeMirrorRecord } from '$platform/integrations/lark/bitable-read';
import type { PlatformCapability } from '$platform/ai/capability-registry';

const CUSTOMER_INVOICE_TABLE_ID = 'tblu0YO7vWUhDfTM';
const SUPPLIER_INVOICE_TABLE_ID = 'tblepuB54ojDCnE6';
const INCOME_TABLE_ID = 'tblDaq2hvsa1JTkj';
const OUTCOME_TABLE_ID = 'tblMAHBd3erMl8ql';

const INVOICE_NAME_FIELDS = ['Invoice No', 'Invoice Number', 'No', 'Number', 'Customer', 'Supplier', '发票号', '编号'];
const LEDGER_NAME_FIELDS = ['Description', 'Item', 'Category', 'No', 'Name', '描述', '摘要', '类别'];

const mirrorRecordSchema = z.object({
	recordId: z.string(),
	name: z.string().nullable(),
	fields: z.record(z.string(), z.string())
});

export const financeListInputSchema = z.object({
	limit: z.number().int().min(1).max(200).optional().describe('Maximum records to return.')
});

const financeListOutputSchema = z.object({
	count: z.number().int(),
	returned: z.number().int(),
	truncated: z.boolean(),
	records: z.array(mirrorRecordSchema)
});

type FinanceListInput = z.infer<typeof financeListInputSchema>;
type FinanceListOutput = z.infer<typeof financeListOutputSchema>;

function makeFinanceListCapability(
	id: string,
	description: string,
	tableId: string,
	nameFields: readonly string[]
): PlatformCapability<FinanceListInput, FinanceListOutput> {
	return {
		id,
		description,
		riskLevel: 'R1',
		inputSchema: financeListInputSchema,
		async execute(input, ctx): Promise<FinanceListOutput> {
			if (!ctx.moduleContext) throw new Error(`${id} requires a module context`);
			const records = (await readBitableRecords(ctx.moduleContext.db, tableId)).map((r) =>
				normalizeMirrorRecord(r, nameFields)
			);
			const limit = input.limit ?? 100;
			const selected = records.slice(0, limit);
			return {
				count: records.length,
				returned: selected.length,
				truncated: records.length > selected.length,
				records: selected
			};
		}
	};
}

export const financeListCustomerInvoicesCapability = makeFinanceListCapability(
	'finance.list-customer-invoices',
	'List customer (AR) invoices from the Customer Invoice table (Bitable source of truth).',
	CUSTOMER_INVOICE_TABLE_ID,
	INVOICE_NAME_FIELDS
);

export const financeListSupplierInvoicesCapability = makeFinanceListCapability(
	'finance.list-supplier-invoices',
	'List supplier (AP) invoices from the Supplier Invoice table (Bitable source of truth).',
	SUPPLIER_INVOICE_TABLE_ID,
	INVOICE_NAME_FIELDS
);

export const financeListIncomeCapability = makeFinanceListCapability(
	'finance.list-income',
	'List income ledger entries from the Income table (Bitable source of truth).',
	INCOME_TABLE_ID,
	LEDGER_NAME_FIELDS
);

export const financeListOutcomeCapability = makeFinanceListCapability(
	'finance.list-outcome',
	'List outcome (expense) ledger entries from the Outcome table (Bitable source of truth).',
	OUTCOME_TABLE_ID,
	LEDGER_NAME_FIELDS
);

/** Raw Bitable read tools for the finance agent (composed by the unified loop). */
export const financeReadCapabilities = [
	financeListCustomerInvoicesCapability,
	financeListSupplierInvoicesCapability,
	financeListIncomeCapability,
	financeListOutcomeCapability
] as const;
