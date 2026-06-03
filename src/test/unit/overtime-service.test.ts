import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoist mock functions so they are available inside vi.mock factory ─────────
const { mockFindById, mockFindByAttendanceRecordId } = vi.hoisted(() => ({
	mockFindById: vi.fn(),
	mockFindByAttendanceRecordId: vi.fn()
}));

// ── Mock the repository module ────────────────────────────────────────────────
vi.mock('$modules/hr/repositories/overtime-repository', () => ({
	OvertimeRequestRepository: vi.fn().mockImplementation(() => ({
		findById: mockFindById,
		findByAttendanceRecordId: mockFindByAttendanceRecordId
	})),
	OvertimeApprovalRecordRepository: vi.fn().mockImplementation(() => ({
		findByOvertimeRequestId: vi.fn().mockResolvedValue([])
	}))
}));

import { OvertimeService, OvertimeValidationError } from '$modules/hr/services/overtime-service';
import type { ModuleContext } from '$platform/modules/types';

// ── Context factory ───────────────────────────────────────────────────────────
// `attendanceRows` is what the db.select().from().where().limit() chain resolves
// to — i.e. the attendance record lookup inside generateOvertimeRequest.

function makeCtx(attendanceRows: unknown[] = []): ModuleContext {
	const insertValues = vi.fn();
	return {
		db: {
			batch: vi.fn().mockResolvedValue([]),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({ where: vi.fn() })
			}),
			insert: vi.fn().mockReturnValue({ values: insertValues }),
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue(attendanceRows)
					})
				})
			})
		} as any,
		user: { id: 'u1', email: 'admin@test.com', roles: ['owner' as const] },
		env: {} as any,
		eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn(), emitAsync: vi.fn() }
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

// ── OvertimeValidationError class ─────────────────────────────────────────────

describe('OvertimeValidationError', () => {
	it('has name "OvertimeValidationError"', () => {
		expect(new OvertimeValidationError('test').name).toBe('OvertimeValidationError');
	});

	it('preserves the message', () => {
		expect(new OvertimeValidationError('custom message').message).toBe('custom message');
	});

	it('is an instance of Error', () => {
		expect(new OvertimeValidationError('x')).toBeInstanceOf(Error);
	});
});

// ── generateOvertimeRequest — validation ──────────────────────────────────────

describe('OvertimeService.generateOvertimeRequest — validation', () => {
	it('throws when the attendance record does not exist', async () => {
		const svc = new OvertimeService(makeCtx([]));
		await expect(svc.generateOvertimeRequest('missing')).rejects.toThrow(OvertimeValidationError);
		await expect(svc.generateOvertimeRequest('missing')).rejects.toThrow(
			'Attendance record not found'
		);
	});

	it('throws when overtime_minutes is 0', async () => {
		const svc = new OvertimeService(
			makeCtx([{ id: 'ar1', personId: 'p1', workDate: '2026-06-01', overtimeMinutes: 0 }])
		);
		await expect(svc.generateOvertimeRequest('ar1')).rejects.toThrow(
			'Attendance record has no overtime to request'
		);
	});

	it('throws when overtime_minutes is negative', async () => {
		const svc = new OvertimeService(
			makeCtx([{ id: 'ar1', personId: 'p1', workDate: '2026-06-01', overtimeMinutes: -10 }])
		);
		await expect(svc.generateOvertimeRequest('ar1')).rejects.toThrow(OvertimeValidationError);
	});

	it('throws when a request already exists for the attendance record', async () => {
		mockFindByAttendanceRecordId.mockResolvedValue({ id: 'existing-req' });
		const svc = new OvertimeService(
			makeCtx([{ id: 'ar1', personId: 'p1', workDate: '2026-06-01', overtimeMinutes: 120 }])
		);
		await expect(svc.generateOvertimeRequest('ar1')).rejects.toThrow(
			'An overtime request already exists for this attendance record'
		);
	});

	it('inserts a pending request when valid and returns an id', async () => {
		mockFindByAttendanceRecordId.mockResolvedValue(null);
		const ctx = makeCtx([
			{ id: 'ar1', personId: 'p1', workDate: '2026-06-17', overtimeMinutes: 120 }
		]);
		const svc = new OvertimeService(ctx);

		const id = await svc.generateOvertimeRequest('ar1', 'Project deadline');

		expect(typeof id).toBe('string');
		expect(ctx.db.insert).toHaveBeenCalledTimes(1);
		const values = (ctx.db.insert as any).mock.results[0].value.values;
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				personId: 'p1',
				attendanceRecordId: 'ar1',
				workDate: '2026-06-17',
				overtimeMinutes: 120,
				reason: 'Project deadline',
				status: 'pending',
				source: 'attendance_detected',
				payrollEffect: 'not_applicable'
			})
		);
	});
});

// ── approveOvertimeRequest — validation ───────────────────────────────────────

describe('OvertimeService.approveOvertimeRequest — validation', () => {
	it('throws when the request is not found', async () => {
		mockFindById.mockResolvedValue(null);
		const svc = new OvertimeService(makeCtx());
		await expect(svc.approveOvertimeRequest('missing')).rejects.toThrow(OvertimeValidationError);
		await expect(svc.approveOvertimeRequest('missing')).rejects.toThrow(
			'Overtime request not found'
		);
	});

	it.each(['approved', 'rejected', 'cancelled'])(
		'throws when the request is already %s',
		async (status) => {
			mockFindById.mockResolvedValue({ id: 'r1', status });
			const svc = new OvertimeService(makeCtx());
			await expect(svc.approveOvertimeRequest('r1')).rejects.toThrow(
				'Only pending requests can be approved'
			);
		}
	);

	it('runs the batch when the request is pending', async () => {
		mockFindById.mockResolvedValue({ id: 'r1', status: 'pending' });
		const ctx = makeCtx();
		const svc = new OvertimeService(ctx);
		await svc.approveOvertimeRequest('r1', 'ok');
		expect(ctx.db.batch).toHaveBeenCalledTimes(1);
	});
});

// ── rejectOvertimeRequest — validation ────────────────────────────────────────

describe('OvertimeService.rejectOvertimeRequest — validation', () => {
	it('throws when the request is not found', async () => {
		mockFindById.mockResolvedValue(null);
		const svc = new OvertimeService(makeCtx());
		await expect(svc.rejectOvertimeRequest('missing', 'reason')).rejects.toThrow(
			'Overtime request not found'
		);
	});

	it.each(['approved', 'rejected', 'cancelled'])(
		'throws when the request is already %s',
		async (status) => {
			mockFindById.mockResolvedValue({ id: 'r1', status });
			const svc = new OvertimeService(makeCtx());
			await expect(svc.rejectOvertimeRequest('r1', 'reason')).rejects.toThrow(
				'Only pending requests can be rejected'
			);
		}
	);

	it('runs the batch when the request is pending', async () => {
		mockFindById.mockResolvedValue({ id: 'r1', status: 'pending' });
		const ctx = makeCtx();
		const svc = new OvertimeService(ctx);
		await svc.rejectOvertimeRequest('r1', 'Not authorised');
		expect(ctx.db.batch).toHaveBeenCalledTimes(1);
	});
});
