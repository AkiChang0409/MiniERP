import { describe, it, expect, beforeAll, inject } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { createAttendanceApi } from '$modules/hr';
import { createEventBus } from '$platform/events/index';
import * as schema from '$infrastructure/db/schema';
import type { ModuleContext } from '$platform/modules/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCtx(): ModuleContext {
	return {
		db: drizzle(env.DB, { schema }),
		user: { id: 'test-hr-admin', email: 'hr@test.com', roles: ['owner' as const] },
		env: env as any,
		eventBus: createEventBus()
	};
}

const now = new Date().toISOString();

async function seedPerson(db: ReturnType<typeof drizzle>, id: string, name: string) {
	await db.insert(schema.persons).values({ id, name, createdAt: now, updatedAt: now });
}

type AttendanceOpts = {
	checkInTime?: string | null;
	checkOutTime?: string | null;
	workedMinutes?: number | null;
	lateMinutes?: number;
	earlyLeaveMinutes?: number;
	overtimeMinutes?: number;
	status?: typeof schema.attendanceRecords.$inferInsert['status'];
	source?: typeof schema.attendanceRecords.$inferInsert['source'];
	payrollEffect?: typeof schema.attendanceRecords.$inferInsert['payrollEffect'];
	notes?: string | null;
};

async function seedRecord(
	db: ReturnType<typeof drizzle>,
	id: string,
	personId: string,
	workDate: string,
	opts: AttendanceOpts = {}
) {
	await db.insert(schema.attendanceRecords).values({
		id,
		personId,
		workDate,
		checkInTime: opts.checkInTime ?? null,
		checkOutTime: opts.checkOutTime ?? null,
		workedMinutes: opts.workedMinutes ?? null,
		lateMinutes: opts.lateMinutes ?? 0,
		earlyLeaveMinutes: opts.earlyLeaveMinutes ?? 0,
		overtimeMinutes: opts.overtimeMinutes ?? 0,
		status: opts.status ?? 'present',
		source: opts.source ?? 'mock',
		payrollEffect: opts.payrollEffect ?? 'not_applicable',
		notes: opts.notes ?? null,
		createdAt: now,
		updatedAt: now
	});
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
	await applyD1Migrations(env.DB, inject('d1Migrations'));
});

// ─── listWeeklyAttendanceSummary — full-week counts ──────────────────────────

describe('listWeeklyAttendanceSummary — full-week status counts', () => {
	it('counts all 6 statuses and computes totals correctly', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createAttendanceApi(ctx);

		// Week 2026-05-04 (Mon) to 2026-05-10 (Sun)
		await seedPerson(db, 'p-wk-counts', 'Alice Tan');
		await seedRecord(db, 'ar-wk-c-1', 'p-wk-counts', '2026-05-04', {
			checkInTime: '09:00', checkOutTime: '18:00', workedMinutes: 540,
			status: 'present', payrollEffect: 'not_applicable'
		});
		await seedRecord(db, 'ar-wk-c-2', 'p-wk-counts', '2026-05-05', {
			checkInTime: '09:30', checkOutTime: '18:00', workedMinutes: 510,
			lateMinutes: 30, status: 'late', payrollEffect: 'pending_review'
		});
		await seedRecord(db, 'ar-wk-c-3', 'p-wk-counts', '2026-05-06', {
			status: 'absent', payrollEffect: 'pending_review'
		});
		await seedRecord(db, 'ar-wk-c-4', 'p-wk-counts', '2026-05-07', {
			status: 'on_leave', payrollEffect: 'not_applicable'
		});
		await seedRecord(db, 'ar-wk-c-5', 'p-wk-counts', '2026-05-08', {
			checkInTime: '09:00', status: 'missing_checkout', payrollEffect: 'pending_review'
		});
		await seedRecord(db, 'ar-wk-c-6', 'p-wk-counts', '2026-05-09', {
			status: 'rest_day', payrollEffect: 'not_applicable'
		});
		await seedRecord(db, 'ar-wk-c-7', 'p-wk-counts', '2026-05-10', {
			status: 'rest_day', payrollEffect: 'not_applicable'
		});

		const summaries = await api.listWeeklySummary({ dateFrom: '2026-05-04', dateTo: '2026-05-10' });
		const s = summaries.find((x) => x.personId === 'p-wk-counts');
		expect(s).toBeDefined();
		expect(s!.weekStart).toBe('2026-05-04');
		expect(s!.weekEnd).toBe('2026-05-10');
		expect(s!.totalRecords).toBe(7);
		expect(s!.presentCount).toBe(1);
		expect(s!.lateCount).toBe(1);
		expect(s!.absentCount).toBe(1);
		expect(s!.onLeaveCount).toBe(1);
		expect(s!.missingCheckoutCount).toBe(1);
		expect(s!.restDayCount).toBe(2);
		expect(s!.totalWorkedMinutes).toBe(1050); // 540 + 510
		expect(s!.payrollReviewCount).toBe(3); // late + absent + missing_checkout
	});

	it('includes overtimeMinutes in totalOvertimeMinutes', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createAttendanceApi(ctx);

		await seedPerson(db, 'p-wk-ot', 'Bob Lee');
		await seedRecord(db, 'ar-ot-1', 'p-wk-ot', '2026-05-04', {
			checkInTime: '09:00', checkOutTime: '20:00', workedMinutes: 660,
			overtimeMinutes: 120, status: 'present', payrollEffect: 'not_applicable'
		});
		await seedRecord(db, 'ar-ot-2', 'p-wk-ot', '2026-05-05', {
			checkInTime: '09:00', checkOutTime: '18:30', workedMinutes: 570,
			overtimeMinutes: 30, status: 'present', payrollEffect: 'not_applicable'
		});

		const summaries = await api.listWeeklySummary({ dateFrom: '2026-05-04', dateTo: '2026-05-10' });
		const s = summaries.find((x) => x.personId === 'p-wk-ot');
		expect(s!.totalOvertimeMinutes).toBe(150);
	});
});

// ─── listWeeklyAttendanceSummary — status filter ─────────────────────────────

describe('listWeeklyAttendanceSummary — status filter (filtered weekly summary)', () => {
	it('only includes records matching the status filter before aggregating', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createAttendanceApi(ctx);

		await seedPerson(db, 'p-sf-1', 'Carol Ong');
		// Same week: one present, one late
		await seedRecord(db, 'ar-sf-1', 'p-sf-1', '2026-05-04', {
			status: 'present', workedMinutes: 540, payrollEffect: 'not_applicable'
		});
		await seedRecord(db, 'ar-sf-2', 'p-sf-1', '2026-05-05', {
			status: 'late', workedMinutes: 510, lateMinutes: 30, payrollEffect: 'pending_review'
		});

		// Filter to late only — the summary should reflect only the late record
		const summaries = await api.listWeeklySummary({
			dateFrom: '2026-05-04', dateTo: '2026-05-10', status: 'late'
		});
		const s = summaries.find((x) => x.personId === 'p-sf-1');
		expect(s).toBeDefined();
		expect(s!.lateCount).toBe(1);
		expect(s!.presentCount).toBe(0);
		expect(s!.totalRecords).toBe(1);
	});

	it('returns empty when no records match the status filter', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createAttendanceApi(ctx);

		await seedPerson(db, 'p-sf-2', 'Dave Ng');
		await seedRecord(db, 'ar-sf-3', 'p-sf-2', '2026-05-04', {
			status: 'present', payrollEffect: 'not_applicable'
		});

		const summaries = await api.listWeeklySummary({
			dateFrom: '2026-05-04', dateTo: '2026-05-10', status: 'absent'
		});
		expect(summaries.find((x) => x.personId === 'p-sf-2')).toBeUndefined();
	});
});

// ─── listWeeklyAttendanceSummary — dateFrom/dateTo filter ────────────────────

describe('listWeeklyAttendanceSummary — date range filter', () => {
	it('excludes records outside the date range', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createAttendanceApi(ctx);

		await seedPerson(db, 'p-dr-1', 'Eve Lim');
		// Three records in different weeks
		await seedRecord(db, 'ar-dr-1', 'p-dr-1', '2026-04-30', { status: 'present', workedMinutes: 540 }); // before range
		await seedRecord(db, 'ar-dr-2', 'p-dr-1', '2026-05-05', { status: 'present', workedMinutes: 540 }); // in range
		await seedRecord(db, 'ar-dr-3', 'p-dr-1', '2026-05-20', { status: 'present', workedMinutes: 540 }); // after range

		const summaries = await api.listWeeklySummary({ dateFrom: '2026-05-01', dateTo: '2026-05-10' });
		const weeks = summaries.filter((x) => x.personId === 'p-dr-1').map((x) => x.weekStart);
		expect(weeks).toContain('2026-05-04'); // week of 2026-05-05
		expect(weeks).not.toContain('2026-04-27'); // week of 2026-04-30
		expect(weeks).not.toContain('2026-05-18'); // week of 2026-05-20
	});
});

// ─── listWeeklyAttendanceSummary — multiple employees sorting ─────────────────

describe('listWeeklyAttendanceSummary — multiple employees, sorting', () => {
	it('sorts by weekStart DESC then employeeName ASC', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createAttendanceApi(ctx);

		await seedPerson(db, 'p-sort-zara', 'Zara Wong');
		await seedPerson(db, 'p-sort-anna', 'Anna Koh');

		// Week 1: 2026-05-04
		await seedRecord(db, 'ar-sort-z-w1', 'p-sort-zara', '2026-05-04', { status: 'present', workedMinutes: 540 });
		await seedRecord(db, 'ar-sort-a-w1', 'p-sort-anna', '2026-05-05', { status: 'present', workedMinutes: 540 });
		// Week 2: 2026-05-11
		await seedRecord(db, 'ar-sort-z-w2', 'p-sort-zara', '2026-05-11', { status: 'present', workedMinutes: 540 });
		await seedRecord(db, 'ar-sort-a-w2', 'p-sort-anna', '2026-05-12', { status: 'present', workedMinutes: 540 });

		const summaries = await api.listWeeklySummary({ dateFrom: '2026-05-04', dateTo: '2026-05-17' });
		const relevant = summaries.filter((x) => x.personId === 'p-sort-zara' || x.personId === 'p-sort-anna');

		expect(relevant).toHaveLength(4);
		expect(relevant.map((r) => `${r.weekStart}/${r.employeeName}`)).toEqual([
			'2026-05-11/Anna Koh',
			'2026-05-11/Zara Wong',
			'2026-05-04/Anna Koh',
			'2026-05-04/Zara Wong'
		]);
	});
});

// ─── listAttendanceRecords — personId + week filter ──────────────────────────

describe('listAttendanceRecords — personId and week filters', () => {
	it('returns only records for the given personId and week', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createAttendanceApi(ctx);

		await seedPerson(db, 'p-rec-1', 'Frank Ho');
		await seedPerson(db, 'p-rec-2', 'Grace Tan');

		// Person 1 — Week A
		await seedRecord(db, 'ar-rec-f-1', 'p-rec-1', '2026-05-04', { status: 'present', checkInTime: '09:00', checkOutTime: '18:00', workedMinutes: 540 });
		await seedRecord(db, 'ar-rec-f-2', 'p-rec-1', '2026-05-05', { status: 'late', checkInTime: '09:30', checkOutTime: '18:00', workedMinutes: 510, lateMinutes: 30, payrollEffect: 'pending_review' });
		// Person 2 — same week (should be excluded)
		await seedRecord(db, 'ar-rec-g-1', 'p-rec-2', '2026-05-04', { status: 'present', workedMinutes: 540 });
		// Person 1 — different week (should be excluded)
		await seedRecord(db, 'ar-rec-f-3', 'p-rec-1', '2026-05-11', { status: 'present', workedMinutes: 540 });

		const records = await api.listRecords({
			personId: 'p-rec-1',
			weekStart: '2026-05-04',
			weekEnd: '2026-05-10'
		});

		const ids = records.map((r) => r.id);
		expect(ids).toContain('ar-rec-f-1');
		expect(ids).toContain('ar-rec-f-2');
		expect(ids).not.toContain('ar-rec-g-1'); // different person
		expect(ids).not.toContain('ar-rec-f-3'); // different week
	});

	it('returns records ordered by workDate ASC', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createAttendanceApi(ctx);

		await seedPerson(db, 'p-order-1', 'Henry Yap');
		// Insert out of date order
		await seedRecord(db, 'ar-ord-3', 'p-order-1', '2026-05-06', { status: 'present', workedMinutes: 540 });
		await seedRecord(db, 'ar-ord-1', 'p-order-1', '2026-05-04', { status: 'present', workedMinutes: 540 });
		await seedRecord(db, 'ar-ord-2', 'p-order-1', '2026-05-05', { status: 'present', workedMinutes: 540 });

		const records = await api.listRecords({
			personId: 'p-order-1',
			weekStart: '2026-05-04',
			weekEnd: '2026-05-10'
		});

		const dates = records.map((r) => r.workDate);
		expect(dates).toEqual(['2026-05-04', '2026-05-05', '2026-05-06']);
	});

	it('returns empty array for personId with no records in the period', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createAttendanceApi(ctx);

		await seedPerson(db, 'p-empty-week', 'Iris Chan');
		// Record exists outside the week
		await seedRecord(db, 'ar-ew-1', 'p-empty-week', '2026-06-01', { status: 'present', workedMinutes: 540 });

		const records = await api.listRecords({
			personId: 'p-empty-week',
			weekStart: '2026-05-04',
			weekEnd: '2026-05-10'
		});
		expect(records).toHaveLength(0);
	});

	it('returns record fields including personName', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createAttendanceApi(ctx);

		await seedPerson(db, 'p-fields-1', 'James Wu');
		await seedRecord(db, 'ar-fields-1', 'p-fields-1', '2026-05-04', {
			checkInTime: '09:00',
			checkOutTime: '18:00',
			workedMinutes: 540,
			lateMinutes: 0,
			earlyLeaveMinutes: 0,
			overtimeMinutes: 0,
			status: 'present',
			source: 'manual',
			payrollEffect: 'not_applicable',
			notes: 'On time'
		});

		const [rec] = await api.listRecords({ personId: 'p-fields-1', weekStart: '2026-05-04', weekEnd: '2026-05-10' });
		expect(rec.personName).toBe('James Wu');
		expect(rec.checkInTime).toBe('09:00');
		expect(rec.checkOutTime).toBe('18:00');
		expect(rec.workedMinutes).toBe(540);
		expect(rec.lateMinutes).toBe(0);
		expect(rec.status).toBe('present');
		expect(rec.source).toBe('manual');
		expect(rec.payrollEffect).toBe('not_applicable');
		expect(rec.notes).toBe('On time');
	});
});

// ─── listAttendanceRecords — status filter ────────────────────────────────────

describe('listAttendanceRecords — status filter', () => {
	it('filters by status when provided', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createAttendanceApi(ctx);

		await seedPerson(db, 'p-status-f', 'Karen Ong');
		await seedRecord(db, 'ar-sf-a', 'p-status-f', '2026-05-04', { status: 'present', workedMinutes: 540 });
		await seedRecord(db, 'ar-sf-b', 'p-status-f', '2026-05-05', { status: 'late', payrollEffect: 'pending_review' });
		await seedRecord(db, 'ar-sf-c', 'p-status-f', '2026-05-06', { status: 'absent', payrollEffect: 'pending_review' });

		const lateRecords = await api.listRecords({ personId: 'p-status-f', status: 'late' });
		expect(lateRecords).toHaveLength(1);
		expect(lateRecords[0].id).toBe('ar-sf-b');
	});
});

// ─── getPersonNameById ────────────────────────────────────────────────────────

describe('getPersonName', () => {
	it('returns the person name for an existing person', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createAttendanceApi(ctx);

		await seedPerson(db, 'p-name-1', 'Leon Koh');
		const name = await api.getPersonName('p-name-1');
		expect(name).toBe('Leon Koh');
	});

	it('returns null for a non-existent person', async () => {
		const api = createAttendanceApi(makeCtx());
		const name = await api.getPersonName('p-does-not-exist');
		expect(name).toBeNull();
	});
});

// ─── getAttendancePayrollInputs ───────────────────────────────────────────────

describe('getPayrollInputs', () => {
	it('returns only pending_review and pending_export records', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createAttendanceApi(ctx);

		await seedPerson(db, 'p-payroll-1', 'Mia Tan');
		await seedRecord(db, 'ar-pay-na',   'p-payroll-1', '2026-05-04', { payrollEffect: 'not_applicable', status: 'present', workedMinutes: 540 });
		await seedRecord(db, 'ar-pay-pr',   'p-payroll-1', '2026-05-05', { status: 'late', payrollEffect: 'pending_review' });
		await seedRecord(db, 'ar-pay-pe',   'p-payroll-1', '2026-05-06', { status: 'absent', payrollEffect: 'pending_export' });
		await seedRecord(db, 'ar-pay-exp',  'p-payroll-1', '2026-05-07', { status: 'present', workedMinutes: 540, payrollEffect: 'exported' });

		const inputs = await api.getPayrollInputs('2026-05-01', '2026-05-31');
		const ids = inputs.map((r) => r.id);

		expect(ids).toContain('ar-pay-pr');
		expect(ids).toContain('ar-pay-pe');
		expect(ids).not.toContain('ar-pay-na');
		expect(ids).not.toContain('ar-pay-exp');
	});

	it('respects the period date range', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createAttendanceApi(ctx);

		await seedPerson(db, 'p-payroll-2', 'Nick Wong');
		await seedRecord(db, 'ar-prange-in',  'p-payroll-2', '2026-05-10', { status: 'absent', payrollEffect: 'pending_review' });
		await seedRecord(db, 'ar-prange-out', 'p-payroll-2', '2026-06-10', { status: 'absent', payrollEffect: 'pending_review' });

		const inputs = await api.getPayrollInputs('2026-05-01', '2026-05-31');
		const ids = inputs.map((r) => r.id);

		expect(ids).toContain('ar-prange-in');
		expect(ids).not.toContain('ar-prange-out');
	});

	it('returns empty array when no records need payroll attention', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createAttendanceApi(ctx);

		await seedPerson(db, 'p-payroll-3', 'Olivia Sim');
		await seedRecord(db, 'ar-pay-clean', 'p-payroll-3', '2026-05-04', {
			status: 'present', workedMinutes: 540, payrollEffect: 'not_applicable'
		});

		const inputs = await api.getPayrollInputs('2026-05-01', '2026-05-31');
		expect(inputs.filter((r) => r.personId === 'p-payroll-3')).toHaveLength(0);
	});
});
