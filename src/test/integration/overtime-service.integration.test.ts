import { describe, it, expect, beforeAll, inject } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { createOvertimeApi, OvertimeValidationError } from '$modules/hr';
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

async function seedAttendance(
	db: ReturnType<typeof drizzle>,
	id: string,
	personId: string,
	workDate: string,
	overtimeMinutes: number,
	opts: { checkInTime?: string; checkOutTime?: string; notes?: string } = {}
) {
	await db.insert(schema.attendanceRecords).values({
		id,
		personId,
		workDate,
		checkInTime: opts.checkInTime ?? '09:00',
		checkOutTime: opts.checkOutTime ?? '20:00',
		workedMinutes: 660,
		lateMinutes: 0,
		earlyLeaveMinutes: 0,
		overtimeMinutes,
		status: 'present',
		source: 'mock',
		payrollEffect: 'not_applicable',
		notes: opts.notes ?? null,
		createdAt: now,
		updatedAt: now
	});
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
	await applyD1Migrations(env.DB, inject('d1Migrations'));
});

// ─── listOvertimeCandidates ────────────────────────────────────────────────────

describe('listOvertimeCandidates', () => {
	it('returns attendance records with overtime_minutes > 0 and no request', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createOvertimeApi(ctx);

		await seedPerson(db, 'p-cand-1', 'Cand Alice');
		await seedAttendance(db, 'ar-cand-ot', 'p-cand-1', '2026-06-17', 120, {
			notes: 'project deadline'
		});
		await seedAttendance(db, 'ar-cand-noot', 'p-cand-1', '2026-06-18', 0); // no overtime

		const candidates = await api.listCandidates({ dateFrom: '2026-06-01', dateTo: '2026-06-30' });
		const ids = candidates.map((c) => c.attendanceRecordId);

		expect(ids).toContain('ar-cand-ot');
		expect(ids).not.toContain('ar-cand-noot');
		const cand = candidates.find((c) => c.attendanceRecordId === 'ar-cand-ot')!;
		expect(cand.overtimeMinutes).toBe(120);
		expect(cand.personName).toBe('Cand Alice');
	});

	it('excludes attendance records that already have an overtime request', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createOvertimeApi(ctx);

		await seedPerson(db, 'p-cand-2', 'Cand Bob');
		await seedAttendance(db, 'ar-cand-gen', 'p-cand-2', '2026-06-19', 90);

		// Before generation: present as candidate
		let candidates = await api.listCandidates({ dateFrom: '2026-06-01', dateTo: '2026-06-30' });
		expect(candidates.map((c) => c.attendanceRecordId)).toContain('ar-cand-gen');

		await api.generateRequest('ar-cand-gen');

		// After generation: no longer a candidate
		candidates = await api.listCandidates({ dateFrom: '2026-06-01', dateTo: '2026-06-30' });
		expect(candidates.map((c) => c.attendanceRecordId)).not.toContain('ar-cand-gen');
	});
});

// ─── generateOvertimeRequest ───────────────────────────────────────────────────

describe('generateOvertimeRequest', () => {
	it('creates a pending request from an attendance record', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createOvertimeApi(ctx);

		await seedPerson(db, 'p-gen-1', 'Gen Carol');
		await seedAttendance(db, 'ar-gen-1', 'p-gen-1', '2026-06-26', 60);

		const id = await api.generateRequest('ar-gen-1', 'Month-end close');

		const [req] = await db
			.select()
			.from(schema.overtimeRequests)
			.where(eq(schema.overtimeRequests.id, id));

		expect(req.personId).toBe('p-gen-1');
		expect(req.attendanceRecordId).toBe('ar-gen-1');
		expect(req.workDate).toBe('2026-06-26');
		expect(req.overtimeMinutes).toBe(60);
		expect(req.reason).toBe('Month-end close');
		expect(req.status).toBe('pending');
		expect(req.source).toBe('attendance_detected');
		expect(req.payrollEffect).toBe('not_applicable');
	});

	it('throws when generating twice from the same attendance record', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createOvertimeApi(ctx);

		await seedPerson(db, 'p-gen-2', 'Gen Dave');
		await seedAttendance(db, 'ar-gen-dup', 'p-gen-2', '2026-06-22', 90);

		await api.generateRequest('ar-gen-dup');
		await expect(api.generateRequest('ar-gen-dup')).rejects.toThrow(OvertimeValidationError);
		await expect(api.generateRequest('ar-gen-dup')).rejects.toThrow(
			'An overtime request already exists for this attendance record'
		);

		// Exactly one request exists
		const rows = await db
			.select()
			.from(schema.overtimeRequests)
			.where(eq(schema.overtimeRequests.attendanceRecordId, 'ar-gen-dup'));
		expect(rows).toHaveLength(1);
	});

	it('throws when the attendance record has no overtime', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createOvertimeApi(ctx);

		await seedPerson(db, 'p-gen-3', 'Gen Eve');
		await seedAttendance(db, 'ar-gen-noot', 'p-gen-3', '2026-06-23', 0);

		await expect(api.generateRequest('ar-gen-noot')).rejects.toThrow(
			'Attendance record has no overtime to request'
		);
	});

	it('throws when the attendance record does not exist', async () => {
		const api = createOvertimeApi(makeCtx());
		await expect(api.generateRequest('does-not-exist')).rejects.toThrow('Attendance record not found');
	});
});

// ─── approveOvertimeRequest ─────────────────────────────────────────────────────

describe('approveOvertimeRequest', () => {
	it('sets status approved + payroll_effect pending_export and snapshots approver', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createOvertimeApi(ctx);

		await seedPerson(db, 'p-app-1', 'App Frank');
		await seedAttendance(db, 'ar-app-1', 'p-app-1', '2026-06-09', 60);
		const id = await api.generateRequest('ar-app-1');

		await api.approveRequest(id, 'Approved by manager');

		const [req] = await db
			.select()
			.from(schema.overtimeRequests)
			.where(eq(schema.overtimeRequests.id, id));
		expect(req.status).toBe('approved');
		expect(req.payrollEffect).toBe('pending_export');
		expect(req.approvedByUserId).toBe('test-hr-admin');
		expect(req.approvedAt).toBeTruthy();
	});

	it('writes an overtime_approval_records audit row on approve', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createOvertimeApi(ctx);

		await seedPerson(db, 'p-app-2', 'App Grace');
		await seedAttendance(db, 'ar-app-2', 'p-app-2', '2026-06-15', 30);
		const id = await api.generateRequest('ar-app-2');

		await api.approveRequest(id);

		const records = await db
			.select()
			.from(schema.overtimeApprovalRecords)
			.where(eq(schema.overtimeApprovalRecords.overtimeRequestId, id));

		expect(records).toHaveLength(1);
		expect(records[0].action).toBe('approved');
		expect(records[0].fromStatus).toBe('pending');
		expect(records[0].toStatus).toBe('approved');
		expect(records[0].actorId).toBe('test-hr-admin');
		expect(records[0].actorName).toBe('hr@test.com');
	});

	it('throws when approving a non-pending request', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createOvertimeApi(ctx);

		await seedPerson(db, 'p-app-3', 'App Henry');
		await seedAttendance(db, 'ar-app-3', 'p-app-3', '2026-06-17', 120);
		const id = await api.generateRequest('ar-app-3');
		await api.approveRequest(id);

		await expect(api.approveRequest(id)).rejects.toThrow('Only pending requests can be approved');
	});
});

// ─── rejectOvertimeRequest ──────────────────────────────────────────────────────

describe('rejectOvertimeRequest', () => {
	it('sets status rejected + payroll_effect not_applicable and snapshots reason', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createOvertimeApi(ctx);

		await seedPerson(db, 'p-rej-1', 'Rej Ivy');
		await seedAttendance(db, 'ar-rej-1', 'p-rej-1', '2026-06-12', 30);
		const id = await api.generateRequest('ar-rej-1');

		await api.rejectRequest(id, 'Not pre-approved');

		const [req] = await db
			.select()
			.from(schema.overtimeRequests)
			.where(eq(schema.overtimeRequests.id, id));
		expect(req.status).toBe('rejected');
		expect(req.payrollEffect).toBe('not_applicable');
		expect(req.rejectedByUserId).toBe('test-hr-admin');
		expect(req.rejectionReason).toBe('Not pre-approved');
	});

	it('writes an overtime_approval_records audit row on reject', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createOvertimeApi(ctx);

		await seedPerson(db, 'p-rej-2', 'Rej Jack');
		await seedAttendance(db, 'ar-rej-2', 'p-rej-2', '2026-06-16', 45);
		const id = await api.generateRequest('ar-rej-2');

		await api.rejectRequest(id, 'Insufficient justification');

		const records = await db
			.select()
			.from(schema.overtimeApprovalRecords)
			.where(eq(schema.overtimeApprovalRecords.overtimeRequestId, id));

		expect(records).toHaveLength(1);
		expect(records[0].action).toBe('rejected');
		expect(records[0].fromStatus).toBe('pending');
		expect(records[0].toStatus).toBe('rejected');
		expect(records[0].comment).toBe('Insufficient justification');
	});

	it('throws when rejecting a non-pending request', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createOvertimeApi(ctx);

		await seedPerson(db, 'p-rej-3', 'Rej Kim');
		await seedAttendance(db, 'ar-rej-3', 'p-rej-3', '2026-06-22', 90);
		const id = await api.generateRequest('ar-rej-3');
		await api.rejectRequest(id, 'reason');

		await expect(api.rejectRequest(id, 'again')).rejects.toThrow(
			'Only pending requests can be rejected'
		);
	});
});

// ─── getOvertimePayrollInputs ───────────────────────────────────────────────────

describe('getOvertimePayrollInputs', () => {
	it('returns only approved + pending_export requests within the period', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		const api = createOvertimeApi(ctx);

		await seedPerson(db, 'p-pay-1', 'Pay Liam');
		// approved → should be included
		await seedAttendance(db, 'ar-pay-approved', 'p-pay-1', '2026-07-03', 120);
		const approvedId = await api.generateRequest('ar-pay-approved');
		await api.approveRequest(approvedId);

		// pending → should be excluded (still not_applicable)
		await seedAttendance(db, 'ar-pay-pending', 'p-pay-1', '2026-07-04', 60);
		await api.generateRequest('ar-pay-pending');

		// rejected → should be excluded
		await seedAttendance(db, 'ar-pay-rejected', 'p-pay-1', '2026-07-05', 30);
		const rejectedId = await api.generateRequest('ar-pay-rejected');
		await api.rejectRequest(rejectedId, 'no');

		// approved but out of period → should be excluded
		await seedAttendance(db, 'ar-pay-out', 'p-pay-1', '2026-08-01', 60);
		const outId = await api.generateRequest('ar-pay-out');
		await api.approveRequest(outId);

		const inputs = await api.getPayrollInputs('2026-07-01', '2026-07-31');
		const ids = inputs.map((r) => r.id);

		expect(ids).toContain(approvedId);
		expect(ids).not.toContain(outId);
		for (const row of inputs) {
			expect(row.status).toBe('approved');
			expect(row.payrollEffect).toBe('pending_export');
			expect(row.workDate >= '2026-07-01' && row.workDate <= '2026-07-31').toBe(true);
		}
	});
});
