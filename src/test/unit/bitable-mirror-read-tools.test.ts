import { describe, it, expect, vi } from 'vitest';

/**
 * P3 read-from-Bitable for inventory + finance: raw list tools read the domain's
 * Bitable mirror and return normalized records (name picked from candidate
 * fields, values flattened to text). The unified loop composes the answer.
 */
const ITEMS = [
	{ recordId: 'recItem1', fields: { 'Item Name': 'Widget A', SKU: 'WA-1', Qty: 12 } },
	{ recordId: 'recItem2', fields: { 'Item Name': 'Widget B', SKU: 'WB-2' } }
];
const CUST_INVOICES = [{ recordId: 'recInv1', fields: { 'Invoice No': 'INV-001', Amount: 1200, Status: 'Overdue' } }];

vi.mock('$platform/integrations/lark/bitable-read', async (orig) => {
	const actual = await orig<typeof import('$platform/integrations/lark/bitable-read')>();
	return {
		...actual,
		readBitableRecords: vi.fn(async (_db: unknown, tableId: string) =>
			tableId === 'tblacMmS2cFonqkx' ? ITEMS : tableId === 'tblu0YO7vWUhDfTM' ? CUST_INVOICES : []
		)
	};
});

import { inventoryListItemsCapability } from '$modules/inventory/ai-capabilities';
import { financeListCustomerInvoicesCapability } from '$modules/finance/ai-capabilities';

const ctx = { moduleContext: { db: {}, env: {} } } as never;

describe('P3 inventory/finance Bitable read tools', () => {
	it('inventory.list-items reads the Items mirror + normalizes', async () => {
		const out = await inventoryListItemsCapability.execute({}, ctx);
		expect(out.count).toBe(2);
		expect(out.records[0].name).toBe('Widget A');
		expect(out.records[0].fields.Qty).toBe('12'); // number flattened to text
	});

	it('finance.list-customer-invoices reads the Customer Invoice mirror', async () => {
		const out = await financeListCustomerInvoicesCapability.execute({}, ctx);
		expect(out.count).toBe(1);
		expect(out.records[0].name).toBe('INV-001');
		expect(out.records[0].fields.Status).toBe('Overdue');
	});

	it('respects the limit', async () => {
		const out = await inventoryListItemsCapability.execute({ limit: 1 }, ctx);
		expect(out.returned).toBe(1);
		expect(out.truncated).toBe(true);
	});
});
