import { describe, it, expect, beforeAll, inject } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq, isNull } from 'drizzle-orm';
import { createLeaveApi, LeaveValidationError } from '$modules/hr';
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

async function seedLeaveType(
	db: ReturnType<typeof drizzle>,
	id: string,
	code: string,
	name: string,
	affectsPayroll = false
) {
	await db
		.insert(schema.leaveTypes)
		.values({ id, code, name, affectsPayroll, createdAt: now, updatedAt: now });
}

async function seedLeaveRequest(
	db: ReturnType<typeof drizzle>,
	id: string,
	personId: string,
	leaveTypeId: string,
	opts: {
		status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
		totalDays?: number;
		startDate?: string;
	} = {}
) {
	await db.insert(schema.leaveRequests).values({
		id,
		personId,
		leaveTypeId,
		startDate: opts.startDate ?? '2026-06-01',
		endDate: '2026-06-05',
		totalDays: opts.totalDays ?? 5,
		status: opts.status ?? 'pending',
		source: 'mock',
		submittedAt: now,
		createdAt: now,
		updatedAt: now
	});
}

async function seedLeaveBalance(
	db: ReturnType<typeof drizzle>,
	id: string,
	personId: string,
	leaveTypeId: string,
	opts: { year?: number; entitledDays?: number; usedDays?: number; pendingDays?: number } = {}
) {
	await db.insert(schema.leaveBalances).values({
		id,
		personId,
		leaveTypeId,
		year: opts.year ?? 2026,
		entitledDays: opts.entitledDays ?? 14,
		usedDays: opts.usedDays ?? 0,
		pendingDays: opts.pendingDays ?? 5,
		createdAt: now,
		updatedAt: now
	});
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
	await applyD1Migrations(env.DB, inject('d1Migrations'));
});

// ─── approveLeaveRequest — annual leave (affectsPayroll = false) ──────────────

describe('approveLeaveRequest — annual leave', () => {
	it('sets status to approved and shifts balance from pending to used', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createLeaveApi(ctx);

		await seedPerson(db, 'p-annual-1', 'Alice Tan');
		await seedLeaveType(db, 'lt-annual-int', 'ANNUAL_INT', 'Annual Leave', false);
		await seedLeaveRequest(db, 'lr-annual-1', 'p-annual-1', 'lt-annual-int', {
			totalDays: 3,
			startDate: '2026-07-01'
		});
		await seedLeaveBalance(db, 'lb-annual-1', 'p-annual-1', 'lt-annual-int', {
			entitledDays: 14,
			usedDays: 0,
			pendingDays: 3
		});

		await api.approveRequest('lr-annual-1', 'Looks good');

		const [req] = await db
			.select()
			.from(schema.leaveRequests)
			.where(eq(schema.leaveRequests.id, 'lr-annual-1'));
		expect(req.status).toBe('approved');
		expect(req.approvedByUserId).toBe('test-hr-admin');
		expect(req.approvedAt).toBeTruthy();
		expect(req.payrollEffect).toBe('not_applicable');

		const [bal] = await db
			.select()
			.from(schema.leaveBalances)
			.where(eq(schema.leaveBalances.id, 'lb-annual-1'));
		expect(bal.pendingDays).toBe(0);
		expect(bal.usedDays).toBe(3);
	});

	it('inserts a leave_approval_records audit entry', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createLeaveApi(ctx);

		await seedPerson(db, 'p-annual-2', 'Ben Lee');
		await seedLeaveType(db, 'lt-annual-int-2', 'ANNUAL_INT2', 'Annual Leave 2', false);
		await seedLeaveRequest(db, 'lr-annual-2', 'p-annual-2', 'lt-annual-int-2', {
			totalDays: 2,
			startDate: '2026-08-01'
		});
		await seedLeaveBalance(db, 'lb-annual-2', 'p-annual-2', 'lt-annual-int-2', {
			entitledDays: 14,
			usedDays: 0,
			pendingDays: 2
		});

		await api.approveRequest('lr-annual-2');

		const records = await db
			.select()
			.from(schema.leaveApprovalRecords)
			.where(eq(schema.leaveApprovalRecords.leaveRequestId, 'lr-annual-2'));

		expect(records).toHaveLength(1);
		expect(records[0].action).toBe('approved');
		expect(records[0].fromStatus).toBe('pending');
		expect(records[0].toStatus).toBe('approved');
		expect(records[0].actorId).toBe('test-hr-admin');
		expect(records[0].actorName).toBe('hr@test.com');
	});
});

// ─── approveLeaveRequest — unpaid leave (affectsPayroll = true) ───────────────

describe('approveLeaveRequest — unpaid leave', () => {
	it('sets payrollEffect to pending_export', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createLeaveApi(ctx);

		await seedPerson(db, 'p-unpaid-1', 'Carol Wong');
		await seedLeaveType(db, 'lt-unpaid-int', 'UNPAID_INT', 'Unpaid Leave', true);
		await seedLeaveRequest(db, 'lr-unpaid-1', 'p-unpaid-1', 'lt-unpaid-int', {
			totalDays: 1,
			startDate: '2026-09-01'
		});
		await seedLeaveBalance(db, 'lb-unpaid-1', 'p-unpaid-1', 'lt-unpaid-int', {
			entitledDays: 30,
			usedDays: 0,
			pendingDays: 1
		});

		await api.approveRequest('lr-unpaid-1');

		const [req] = await db
			.select()
			.from(schema.leaveRequests)
			.where(eq(schema.leaveRequests.id, 'lr-unpaid-1'));
		expect(req.payrollEffect).toBe('pending_export');
	});
});

// ─── rejectLeaveRequest ───────────────────────────────────────────────────────

describe('rejectLeaveRequest', () => {
	it('sets status to rejected and releases pendingDays (usedDays unchanged)', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createLeaveApi(ctx);

		await seedPerson(db, 'p-reject-1', 'Dave Ng');
		await seedLeaveType(db, 'lt-reject-int', 'SICK_INT', 'Sick Leave', false);
		await seedLeaveRequest(db, 'lr-reject-1', 'p-reject-1', 'lt-reject-int', {
			totalDays: 2,
			startDate: '2026-06-10'
		});
		await seedLeaveBalance(db, 'lb-reject-1', 'p-reject-1', 'lt-reject-int', {
			entitledDays: 14,
			usedDays: 1,
			pendingDays: 2
		});

		await api.rejectRequest('lr-reject-1', 'Insufficient documentation');

		const [req] = await db
			.select()
			.from(schema.leaveRequests)
			.where(eq(schema.leaveRequests.id, 'lr-reject-1'));
		expect(req.status).toBe('rejected');
		expect(req.rejectedByUserId).toBe('test-hr-admin');
		expect(req.rejectionReason).toBe('Insufficient documentation');

		const [bal] = await db
			.select()
			.from(schema.leaveBalances)
			.where(eq(schema.leaveBalances.id, 'lb-reject-1'));
		expect(bal.pendingDays).toBe(0);
		expect(bal.usedDays).toBe(1); // unchanged
	});
});

// ─── Validation errors — non-pending requests ─────────────────────────────────

describe('approveLeaveRequest — non-pending', () => {
	it('throws LeaveValidationError for already-approved request', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createLeaveApi(ctx);

		await seedPerson(db, 'p-val-1', 'Eve Lim');
		await seedLeaveType(db, 'lt-val-1', 'ANNUAL_V1', 'Annual V1', false);
		await seedLeaveRequest(db, 'lr-val-approved', 'p-val-1', 'lt-val-1', { status: 'approved' });

		await expect(api.approveRequest('lr-val-approved')).rejects.toThrow(LeaveValidationError);
		await expect(api.approveRequest('lr-val-approved')).rejects.toThrow(
			'Only pending requests can be approved'
		);
	});

	it('throws LeaveValidationError for rejected request', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createLeaveApi(ctx);

		await seedPerson(db, 'p-val-2', 'Frank Ho');
		await seedLeaveType(db, 'lt-val-2', 'ANNUAL_V2', 'Annual V2', false);
		await seedLeaveRequest(db, 'lr-val-rejected', 'p-val-2', 'lt-val-2', { status: 'rejected' });

		await expect(api.approveRequest('lr-val-rejected')).rejects.toThrow(LeaveValidationError);
	});

	it('throws LeaveValidationError when request not found', async () => {
		const api = createLeaveApi(makeCtx());
		await expect(api.approveRequest('does-not-exist')).rejects.toThrow(LeaveValidationError);
		await expect(api.approveRequest('does-not-exist')).rejects.toThrow('Leave request not found');
	});
});

describe('rejectLeaveRequest — non-pending', () => {
	it('throws LeaveValidationError for already-approved request', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createLeaveApi(ctx);

		await seedPerson(db, 'p-val-3', 'Grace Koh');
		await seedLeaveType(db, 'lt-val-3', 'ANNUAL_V3', 'Annual V3', false);
		await seedLeaveRequest(db, 'lr-val-rej-approved', 'p-val-3', 'lt-val-3', {
			status: 'approved'
		});

		await expect(api.rejectRequest('lr-val-rej-approved', 'reason')).rejects.toThrow(
			LeaveValidationError
		);
		await expect(api.rejectRequest('lr-val-rej-approved', 'reason')).rejects.toThrow(
			'Only pending requests can be rejected'
		);
	});

	it('throws LeaveValidationError when request not found', async () => {
		const api = createLeaveApi(makeCtx());
		await expect(api.rejectRequest('ghost-id', 'reason')).rejects.toThrow(LeaveValidationError);
		await expect(api.rejectRequest('ghost-id', 'reason')).rejects.toThrow(
			'Leave request not found'
		);
	});
});

// ─── listLeaveRequests — filters ──────────────────────────────────────────────

describe('listLeaveRequests — filter by status', () => {
	it('returns only requests matching the given status', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createLeaveApi(ctx);

		await seedPerson(db, 'p-filter-1', 'Henry Tan');
		await seedLeaveType(db, 'lt-filter-1', 'ANNUAL_F1', 'Annual Filter', false);
		await seedLeaveRequest(db, 'lr-filter-pending', 'p-filter-1', 'lt-filter-1', {
			status: 'pending'
		});
		await seedLeaveRequest(db, 'lr-filter-approved', 'p-filter-1', 'lt-filter-1', {
			status: 'approved'
		});

		const pending = await api.listLeaveRequests({ status: 'pending' });
		const pendingIds = pending.map((r) => r.id);
		expect(pendingIds).toContain('lr-filter-pending');
		expect(pendingIds).not.toContain('lr-filter-approved');
	});
});

describe('listLeaveRequests — filter by leaveTypeId', () => {
	it('returns only requests for the given leave type', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createLeaveApi(ctx);

		await seedPerson(db, 'p-filter-2', 'Irene Goh');
		await seedLeaveType(db, 'lt-filter-annual', 'ANNUAL_FT', 'Annual FT', false);
		await seedLeaveType(db, 'lt-filter-sick', 'SICK_FT', 'Sick FT', false);
		await seedLeaveRequest(db, 'lr-filter-annual-type', 'p-filter-2', 'lt-filter-annual');
		await seedLeaveRequest(db, 'lr-filter-sick-type', 'p-filter-2', 'lt-filter-sick');

		const results = await api.listLeaveRequests({ leaveTypeId: 'lt-filter-annual' });
		const ids = results.map((r) => r.id);
		expect(ids).toContain('lr-filter-annual-type');
		expect(ids).not.toContain('lr-filter-sick-type');
	});
});

// ─── listLeaveBalances — remainingDays calculation ────────────────────────────

describe('listLeaveBalances — remainingDays', () => {
	it('computes remainingDays = entitledDays - usedDays - pendingDays', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createLeaveApi(ctx);

		await seedPerson(db, 'p-bal-1', 'James Wu');
		await seedLeaveType(db, 'lt-bal-1', 'ANNUAL_BAL', 'Annual Balance', false);
		await seedLeaveBalance(db, 'lb-bal-calc', 'p-bal-1', 'lt-bal-1', {
			year: 2026,
			entitledDays: 14,
			usedDays: 4,
			pendingDays: 3
		});

		const balances = await api.listLeaveBalances(2026);
		const bal = balances.find((b) => b.id === 'lb-bal-calc');

		expect(bal).toBeDefined();
		expect(bal!.remainingDays).toBe(7); // 14 - 4 - 3
	});

	it('filters to the requested year only', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createLeaveApi(ctx);

		await seedPerson(db, 'p-bal-2', 'Karen Ong');
		await seedLeaveType(db, 'lt-bal-2', 'ANNUAL_BAL2', 'Annual Balance 2', false);
		await seedLeaveBalance(db, 'lb-bal-2025', 'p-bal-2', 'lt-bal-2', {
			year: 2025,
			entitledDays: 14,
			usedDays: 0,
			pendingDays: 0
		});
		await seedLeaveBalance(db, 'lb-bal-2026', 'p-bal-2', 'lt-bal-2', {
			year: 2026,
			entitledDays: 14,
			usedDays: 2,
			pendingDays: 0
		});

		const results2025 = await api.listLeaveBalances(2025);
		const results2026 = await api.listLeaveBalances(2026);

		expect(results2025.find((b) => b.id === 'lb-bal-2025')).toBeDefined();
		expect(results2025.find((b) => b.id === 'lb-bal-2026')).toBeUndefined();
		expect(results2026.find((b) => b.id === 'lb-bal-2026')).toBeDefined();
		expect(results2026.find((b) => b.id === 'lb-bal-2025')).toBeUndefined();
	});
});

// ─── Leave → Attendance sync ──────────────────────────────────────────────────

// Helper: query all attendance records for a person within a date range
async function findAttendance(
	db: ReturnType<typeof drizzle>,
	personId: string,
	dateFrom: string,
	dateTo: string
) {
	return db
		.select()
		.from(schema.attendanceRecords)
		.where(
			and(
				isNull(schema.attendanceRecords.deletedAt),
				eq(schema.attendanceRecords.personId, personId)
			)
		)
		.then((rows) => rows.filter((r) => r.workDate >= dateFrom && r.workDate <= dateTo));
}

describe('approveLeaveRequest — attendance sync (annual leave)', () => {
	it('creates on_leave attendance records for each day of the leave', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createLeaveApi(ctx);

		await seedPerson(db, 'p-sync-annual', 'Sync Alice');
		await seedLeaveType(db, 'lt-sync-annual', 'ANNUAL_SYNC', 'Annual Sync', false);
		await seedLeaveRequest(db, 'lr-sync-annual', 'p-sync-annual', 'lt-sync-annual', {
			startDate: '2026-07-01',
			totalDays: 3
		});
		// endDate defaults to '2026-06-05' in seedLeaveRequest — override inline
		await db
			.update(schema.leaveRequests)
			.set({ endDate: '2026-07-03' })
			.where(eq(schema.leaveRequests.id, 'lr-sync-annual'));
		await seedLeaveBalance(db, 'lb-sync-annual', 'p-sync-annual', 'lt-sync-annual', {
			entitledDays: 14, pendingDays: 3
		});

		await api.approveRequest('lr-sync-annual');

		const records = await findAttendance(db, 'p-sync-annual', '2026-07-01', '2026-07-03');
		expect(records).toHaveLength(3);
		for (const rec of records) {
			expect(rec.status).toBe('on_leave');
			expect(rec.source).toBe('leave_sync');
			expect(rec.payrollEffect).toBe('not_applicable');
			expect(rec.checkInTime).toBeNull();
			expect(rec.checkOutTime).toBeNull();
			expect(rec.workedMinutes).toBeNull();
			expect(rec.lateMinutes).toBe(0);
			expect(rec.notes).toMatch('lr-sync-annual');
		}
		// Dates covered exactly 2026-07-01, 2026-07-02, 2026-07-03
		const dates = records.map((r) => r.workDate).sort();
		expect(dates).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
	});
});

describe('approveLeaveRequest — attendance sync (unpaid leave)', () => {
	it('sets attendance payrollEffect = not_applicable even for unpaid leave', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createLeaveApi(ctx);

		await seedPerson(db, 'p-sync-unpaid', 'Sync Bob');
		await seedLeaveType(db, 'lt-sync-unpaid', 'UNPAID_SYNC', 'Unpaid Sync', true);
		await seedLeaveRequest(db, 'lr-sync-unpaid', 'p-sync-unpaid', 'lt-sync-unpaid', {
			startDate: '2026-08-01',
			totalDays: 1
		});
		await db
			.update(schema.leaveRequests)
			.set({ endDate: '2026-08-01' })
			.where(eq(schema.leaveRequests.id, 'lr-sync-unpaid'));
		await seedLeaveBalance(db, 'lb-sync-unpaid', 'p-sync-unpaid', 'lt-sync-unpaid', {
			entitledDays: 30, pendingDays: 1
		});

		await api.approveRequest('lr-sync-unpaid');

		// leave_requests.payrollEffect should be pending_export (unpaid)
		const [req] = await db
			.select()
			.from(schema.leaveRequests)
			.where(eq(schema.leaveRequests.id, 'lr-sync-unpaid'));
		expect(req.payrollEffect).toBe('pending_export');

		// attendance_records.payrollEffect must be not_applicable (never pending_export)
		const records = await findAttendance(db, 'p-sync-unpaid', '2026-08-01', '2026-08-01');
		expect(records).toHaveLength(1);
		expect(records[0].status).toBe('on_leave');
		expect(records[0].payrollEffect).toBe('not_applicable');
	});
});

describe('approveLeaveRequest — attendance sync overwrite (mock record)', () => {
	it('overwrites a pre-existing mock attendance record with on_leave', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createLeaveApi(ctx);

		await seedPerson(db, 'p-sync-overwrite', 'Sync Carol');
		await seedLeaveType(db, 'lt-sync-overwrite', 'ANNUAL_OVW', 'Annual Overwrite', false);
		await seedLeaveRequest(db, 'lr-sync-overwrite', 'p-sync-overwrite', 'lt-sync-overwrite', {
			startDate: '2026-09-01',
			totalDays: 1
		});
		await db
			.update(schema.leaveRequests)
			.set({ endDate: '2026-09-01' })
			.where(eq(schema.leaveRequests.id, 'lr-sync-overwrite'));
		await seedLeaveBalance(db, 'lb-sync-overwrite', 'p-sync-overwrite', 'lt-sync-overwrite', {
			entitledDays: 14, pendingDays: 1
		});

		// Pre-existing mock attendance record for the same date
		await db.insert(schema.attendanceRecords).values({
			id: 'ar-pre-mock',
			personId: 'p-sync-overwrite',
			workDate: '2026-09-01',
			checkInTime: '09:00',
			checkOutTime: '18:00',
			workedMinutes: 540,
			lateMinutes: 0,
			earlyLeaveMinutes: 0,
			overtimeMinutes: 0,
			status: 'present',
			source: 'mock',
			payrollEffect: 'not_applicable',
			notes: null,
			createdAt: now,
			updatedAt: now
		});

		await api.approveRequest('lr-sync-overwrite');

		const records = await findAttendance(db, 'p-sync-overwrite', '2026-09-01', '2026-09-01');
		expect(records).toHaveLength(1);
		expect(records[0].status).toBe('on_leave');
		expect(records[0].source).toBe('leave_sync');
		expect(records[0].checkInTime).toBeNull();
		expect(records[0].workedMinutes).toBeNull();
	});
});

describe('syncApprovedLeavesToAttendance — backfill', () => {
	it('syncs already-approved leave requests to attendance_records', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createLeaveApi(ctx);

		await seedPerson(db, 'p-backfill-1', 'Backfill Dave');
		await seedLeaveType(db, 'lt-backfill-1', 'ANNUAL_BF', 'Annual Backfill', false);

		// Insert already-approved leave request directly (bypassing approveRequest)
		await db.insert(schema.leaveRequests).values({
			id: 'lr-backfill-1',
			personId: 'p-backfill-1',
			leaveTypeId: 'lt-backfill-1',
			startDate: '2026-10-01',
			endDate: '2026-10-02',
			totalDays: 2,
			status: 'approved',
			source: 'mock',
			payrollEffect: 'not_applicable',
			submittedAt: now,
			createdAt: now,
			updatedAt: now
		});

		const synced = await api.syncBackfill('2026-10-01', '2026-10-31');
		expect(synced).toBeGreaterThanOrEqual(1);

		const records = await findAttendance(db, 'p-backfill-1', '2026-10-01', '2026-10-02');
		expect(records).toHaveLength(2);
		for (const rec of records) {
			expect(rec.status).toBe('on_leave');
			expect(rec.source).toBe('leave_sync');
		}
	});

	it('is idempotent — re-running backfill does not duplicate records', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createLeaveApi(ctx);

		await seedPerson(db, 'p-backfill-2', 'Backfill Eve');
		await seedLeaveType(db, 'lt-backfill-2', 'ANNUAL_BF2', 'Annual Backfill 2', false);
		await db.insert(schema.leaveRequests).values({
			id: 'lr-backfill-2',
			personId: 'p-backfill-2',
			leaveTypeId: 'lt-backfill-2',
			startDate: '2026-11-01',
			endDate: '2026-11-01',
			totalDays: 1,
			status: 'approved',
			source: 'mock',
			payrollEffect: 'not_applicable',
			submittedAt: now,
			createdAt: now,
			updatedAt: now
		});

		await api.syncBackfill('2026-11-01', '2026-11-30');
		await api.syncBackfill('2026-11-01', '2026-11-30'); // second run

		const records = await findAttendance(db, 'p-backfill-2', '2026-11-01', '2026-11-01');
		expect(records).toHaveLength(1); // exactly one, not two
		expect(records[0].status).toBe('on_leave');
	});

	it('does not sync rejected or pending leave requests', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createLeaveApi(ctx);

		await seedPerson(db, 'p-backfill-3', 'Backfill Frank');
		await seedLeaveType(db, 'lt-backfill-3', 'ANNUAL_BF3', 'Annual Backfill 3', false);

		await db.insert(schema.leaveRequests).values([
			{
				id: 'lr-bf-pending',
				personId: 'p-backfill-3',
				leaveTypeId: 'lt-backfill-3',
				startDate: '2026-12-01',
				endDate: '2026-12-01',
				totalDays: 1,
				status: 'pending',
				source: 'mock',
				payrollEffect: 'not_applicable',
				submittedAt: now,
				createdAt: now,
				updatedAt: now
			},
			{
				id: 'lr-bf-rejected',
				personId: 'p-backfill-3',
				leaveTypeId: 'lt-backfill-3',
				startDate: '2026-12-02',
				endDate: '2026-12-02',
				totalDays: 1,
				status: 'rejected',
				source: 'mock',
				payrollEffect: 'not_applicable',
				submittedAt: now,
				createdAt: now,
				updatedAt: now
			}
		]);

		await api.syncBackfill('2026-12-01', '2026-12-31');

		const records = await findAttendance(db, 'p-backfill-3', '2026-12-01', '2026-12-31');
		expect(records).toHaveLength(0); // neither pending nor rejected should generate attendance
	});
});
