import { describe, it, expect, beforeAll, inject } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { eq, isNull } from 'drizzle-orm';
import { createFinanceApi } from '$modules/finance/services/api';
import { createEventBus } from '$platform/events/index';
import * as schema from '$infrastructure/db/schema';
import type { ModuleContext } from '$platform/modules/types';

// ─── Shared helpers ──────────────────────────────────────────────────────────

function makeCtx(): ModuleContext {
	return {
		db: drizzle(env.DB, { schema }),
		user: { id: 'test-user', email: 'test@smartfin.test', name: 'Test User' } as any,
		env: env as any,
		eventBus: createEventBus()
	};
}

beforeAll(async () => {
	await applyD1Migrations(env.DB, inject('d1Migrations'));
});

// ─── createStandaloneExpense → DB round-trip ─────────────────────────────────

describe('createStandaloneExpense → DB round-trip', () => {
	it('inserts the expense and returns a valid UUID', async () => {
		const api = createFinanceApi(makeCtx());
		const result = await api.expenses.createStandaloneExpense({
			expenseType: 'opex',
			category: 'transport',
			amount: 45.0,
			currency: 'SGD',
			date: '2025-01-15',
			vendorOrSupplier: 'Grab',
			notes: 'Client meeting transport'
		});

		expect(result.id).toBeDefined();
		expect(typeof result.id).toBe('string');
		expect(result.id.split('-')).toHaveLength(5); // UUID v4 format
	});

	it('persists the record to D1 with correct amount and currency', async () => {
		const ctx = makeCtx();
		const api = createFinanceApi(ctx);
		const result = await api.expenses.createStandaloneExpense({
			expenseType: 'opex',
			category: 'meal',
			amount: 32.5,
			currency: 'SGD',
			date: '2025-02-20'
		});

		const [row] = await ctx.db
			.select({
				id: schema.expenses.id,
				amount: schema.expenses.amount,
				currency: schema.expenses.currency,
				deletedAt: schema.expenses.deletedAt
			})
			.from(schema.expenses)
			.where(eq(schema.expenses.id, result.id))
			.limit(1);

		expect(row).toBeDefined();
		expect(row.amount).toBe(32.5);
		expect(row.currency).toBe('SGD');
		expect(row.deletedAt).toBeNull();
	});

	it('normalises currency to uppercase', async () => {
		const ctx = makeCtx();
		const api = createFinanceApi(ctx);
		const result = await api.expenses.createStandaloneExpense({
			expenseType: 'opex',
			category: 'others',
			amount: 10,
			currency: 'usd', // lowercase input
			date: '2025-03-01'
		});

		const [row] = await ctx.db
			.select({ currency: schema.expenses.currency })
			.from(schema.expenses)
			.where(eq(schema.expenses.id, result.id))
			.limit(1);

		expect(row.currency).toBe('USD');
	});

	it('soft-deleted expenses are excluded by isNull(deletedAt) queries', async () => {
		const ctx = makeCtx();
		const api = createFinanceApi(ctx);
		const result = await api.expenses.createStandaloneExpense({
			expenseType: 'opex',
			category: 'gift',
			amount: 88,
			currency: 'SGD',
			date: '2025-04-10'
		});

		// Soft-delete via raw DB update
		await ctx.db
			.update(schema.expenses)
			.set({ deletedAt: new Date().toISOString() })
			.where(eq(schema.expenses.id, result.id));

		// Confirm it disappears from the standard non-deleted query
		const rows = await ctx.db
			.select({ id: schema.expenses.id })
			.from(schema.expenses)
			.where(eq(schema.expenses.id, result.id) && isNull(schema.expenses.deletedAt));

		expect(rows).toHaveLength(0);
	});
});
