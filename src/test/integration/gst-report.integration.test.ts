import { describe, it, expect, beforeAll, inject } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { createFinanceApi } from '$modules/finance/services/api';
import { createEventBus } from '$platform/events/index';
import * as schema from '$infrastructure/db/schema';
import type { ModuleContext } from '$platform/modules/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCtx(): ModuleContext {
	return {
		db: drizzle(env.DB, { schema }),
		user: { id: 'test-user', email: 'test@smartfin.test', name: 'Test User' } as any,
		env: env as any,
		eventBus: createEventBus()
	};
}

function nowIso() {
	return new Date().toISOString();
}

beforeAll(async () => {
	await applyD1Migrations(env.DB, inject('d1Migrations'));
});

// ─── GST quarterly report end-to-end ─────────────────────────────────────────

describe('GST quarterly report end-to-end', () => {
	it('returns null for an invalid quarter', async () => {
		const api = createFinanceApi(makeCtx());
		const result = await api.taxes.getGstReturnEstimate('2025', '0');
		expect(result).toBeNull();
	});

	it('returns null for a non-numeric year', async () => {
		const api = createFinanceApi(makeCtx());
		const result = await api.taxes.getGstReturnEstimate('abc', '1');
		expect(result).toBeNull();
	});

	it('returns a GST estimate with all 13 boxes for a valid quarter with no data', async () => {
		const api = createFinanceApi(makeCtx());
		const result = await api.taxes.getGstReturnEstimate('2025', '1');

		expect(result).not.toBeNull();
		expect(result!.year).toBe('2025');
		expect(result!.quarter).toBe('1');
		expect(result!.range.start).toBe('2025-01-01');
		expect(result!.range.end).toBe('2025-03-31');
		expect(result!.boxes).toHaveProperty('box1');
		expect(result!.boxes).toHaveProperty('box13');
	});

	it('Box 6 (output GST) reflects standard-rated revenue seeded in Q2', async () => {
		const ctx = makeCtx();
		const now = nowIso();

		// Seed a standard-rated revenue record in Q2 2025
		await ctx.db.insert(schema.revenue).values({
			id: crypto.randomUUID(),
			amount: 109,
			gstAmount: 9,
			date: '2025-04-15',
			invoiceType: 'standard',
			currency: 'SGD',
			notes: 'Test invoice',
			createdAt: now,
			updatedAt: now
		});

		const api = createFinanceApi(ctx);
		const result = await api.taxes.getGstReturnEstimate('2025', '2');

		expect(result).not.toBeNull();
		// Box 6 = sum of gstAmount for standard-rated revenue → should include 9
		expect(result!.boxes.box6).toBeGreaterThanOrEqual(9);
		// Box 1 = subtotal excl. GST = 109 - 9 = 100
		expect(result!.boxes.box1).toBeGreaterThanOrEqual(100);
	});

	it('Box 7 (input GST) reflects expense GST seeded in Q2', async () => {
		const ctx = makeCtx();
		const now = nowIso();

		// Seed an expense with GST in Q2 2025
		await ctx.db.insert(schema.expenses).values({
			id: crypto.randomUUID(),
			amount: 54.5,
			gstAmount: 4.5,
			date: '2025-05-10',
			expenseType: 'opex',
			category: 'others',
			currency: 'SGD',
			createdAt: now,
			updatedAt: now
		});

		const api = createFinanceApi(ctx);
		const result = await api.taxes.getGstReturnEstimate('2025', '2');

		expect(result).not.toBeNull();
		// Box 7 = sum of expense gstAmount → should include 4.5
		expect(result!.boxes.box7).toBeGreaterThanOrEqual(4.5);
	});

	it('Box 8 equals Box 6 minus Box 7', async () => {
		const api = createFinanceApi(makeCtx());
		const result = await api.taxes.getGstReturnEstimate('2025', '2');

		expect(result).not.toBeNull();
		const { box6, box7, box8 } = result!.boxes;
		expect(box8).toBeCloseTo(box6 - box7, 2);
	});

	it('manual box values default to zero when none are saved', async () => {
		const api = createFinanceApi(makeCtx());
		const result = await api.taxes.getGstReturnEstimate('2025', '3');

		expect(result).not.toBeNull();
		const { box9, box10, box11, box12 } = result!.boxes;
		expect(box9).toBe(0);
		expect(box10).toBe(0);
		expect(box11).toBe(0);
		expect(box12).toBe(0);
	});
});
