import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoist mock functions so they are available inside vi.mock factory ─────────
const { mockLeaveRequestFindById, mockLeaveTypeFindById } = vi.hoisted(() => ({
	mockLeaveRequestFindById: vi.fn(),
	mockLeaveTypeFindById: vi.fn()
}));

// ── Mock the repository module ────────────────────────────────────────────────
vi.mock('$modules/hr/repositories/leave-repository', () => ({
	LeaveTypeRepository: vi.fn().mockImplementation(() => ({
		findById: mockLeaveTypeFindById,
		findAllActive: vi.fn().mockResolvedValue([])
	})),
	LeaveRequestRepository: vi.fn().mockImplementation(() => ({
		findById: mockLeaveRequestFindById,
		findByFilters: vi.fn().mockResolvedValue([])
	})),
	LeaveBalanceRepository: vi.fn().mockImplementation(() => ({
		findByPersonTypeYear: vi.fn().mockResolvedValue(null)
	})),
	LeaveApprovalRecordRepository: vi.fn().mockImplementation(() => ({
		findByLeaveRequestId: vi.fn().mockResolvedValue([])
	}))
}));

import { LeaveService, LeaveValidationError } from '$modules/hr/services/leave-service';
import type { ModuleContext } from '$platform/modules/types';

// ── Minimal context with no-op DB mock (only the select chain needed for unit) ─
function makeCtx(): ModuleContext {
	const makeOrderByMock = () => vi.fn().mockResolvedValue([]);
	const makeWhereMock = () => vi.fn().mockReturnValue({ orderBy: makeOrderByMock() });
	const makeInnerJoin2Mock = () =>
		vi.fn().mockReturnValue({ where: makeWhereMock(), orderBy: makeOrderByMock() });
	const makeInnerJoin1Mock = () =>
		vi.fn().mockReturnValue({ innerJoin: makeInnerJoin2Mock(), where: makeWhereMock() });
	const makeFromMock = () => vi.fn().mockReturnValue({ innerJoin: makeInnerJoin1Mock() });

	return {
		db: {
			batch: vi.fn().mockResolvedValue([]),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({ where: vi.fn() })
			}),
			insert: vi.fn().mockReturnValue({ values: vi.fn() }),
			select: vi.fn().mockReturnValue({ from: makeFromMock() })
		} as any,
		user: { id: 'u1', email: 'admin@test.com', roles: ['owner' as const] },
		env: {} as any,
		eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn(), emitAsync: vi.fn() }
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

// ── LeaveValidationError class ─────────────────────────────────────────────────

describe('LeaveValidationError', () => {
	it('has name "LeaveValidationError"', () => {
		const err = new LeaveValidationError('test');
		expect(err.name).toBe('LeaveValidationError');
	});

	it('preserves the message', () => {
		const err = new LeaveValidationError('custom message');
		expect(err.message).toBe('custom message');
	});

	it('is an instance of Error', () => {
		expect(new LeaveValidationError('x')).toBeInstanceOf(Error);
	});
});

// ── approveLeaveRequest — validation ──────────────────────────────────────────

describe('LeaveService.approveLeaveRequest — validation', () => {
	it('throws LeaveValidationError when request is not found', async () => {
		mockLeaveRequestFindById.mockResolvedValue(null);
		const svc = new LeaveService(makeCtx());
		await expect(svc.approveLeaveRequest('missing-id')).rejects.toThrow(LeaveValidationError);
		await expect(svc.approveLeaveRequest('missing-id')).rejects.toThrow('Leave request not found');
	});

	it('throws when request is already approved', async () => {
		mockLeaveRequestFindById.mockResolvedValue({
			id: 'r1',
			status: 'approved',
			personId: 'p1',
			leaveTypeId: 'lt1',
			totalDays: 5,
			startDate: '2026-06-01'
		});
		const svc = new LeaveService(makeCtx());
		await expect(svc.approveLeaveRequest('r1')).rejects.toThrow(LeaveValidationError);
		await expect(svc.approveLeaveRequest('r1')).rejects.toThrow(
			'Only pending requests can be approved'
		);
	});

	it('throws when request is rejected', async () => {
		mockLeaveRequestFindById.mockResolvedValue({
			id: 'r2',
			status: 'rejected',
			personId: 'p1',
			leaveTypeId: 'lt1',
			totalDays: 5,
			startDate: '2026-06-01'
		});
		const svc = new LeaveService(makeCtx());
		await expect(svc.approveLeaveRequest('r2')).rejects.toThrow(
			'Only pending requests can be approved'
		);
	});

	it('throws when request is cancelled', async () => {
		mockLeaveRequestFindById.mockResolvedValue({
			id: 'r3',
			status: 'cancelled',
			personId: 'p1',
			leaveTypeId: 'lt1',
			totalDays: 5,
			startDate: '2026-06-01'
		});
		const svc = new LeaveService(makeCtx());
		await expect(svc.approveLeaveRequest('r3')).rejects.toThrow(LeaveValidationError);
	});
});

// ── rejectLeaveRequest — validation ───────────────────────────────────────────

describe('LeaveService.rejectLeaveRequest — validation', () => {
	it('throws LeaveValidationError when request is not found', async () => {
		mockLeaveRequestFindById.mockResolvedValue(null);
		const svc = new LeaveService(makeCtx());
		await expect(svc.rejectLeaveRequest('missing-id', 'reason')).rejects.toThrow(
			LeaveValidationError
		);
		await expect(svc.rejectLeaveRequest('missing-id', 'reason')).rejects.toThrow(
			'Leave request not found'
		);
	});

	it('throws when request is already approved', async () => {
		mockLeaveRequestFindById.mockResolvedValue({
			id: 'r4',
			status: 'approved',
			personId: 'p1',
			leaveTypeId: 'lt1',
			totalDays: 3,
			startDate: '2026-07-01'
		});
		const svc = new LeaveService(makeCtx());
		await expect(svc.rejectLeaveRequest('r4', 'reason')).rejects.toThrow(LeaveValidationError);
		await expect(svc.rejectLeaveRequest('r4', 'reason')).rejects.toThrow(
			'Only pending requests can be rejected'
		);
	});

	it('throws when request is already rejected', async () => {
		mockLeaveRequestFindById.mockResolvedValue({
			id: 'r5',
			status: 'rejected',
			personId: 'p1',
			leaveTypeId: 'lt1',
			totalDays: 2,
			startDate: '2026-08-01'
		});
		const svc = new LeaveService(makeCtx());
		await expect(svc.rejectLeaveRequest('r5', 'reason')).rejects.toThrow(
			'Only pending requests can be rejected'
		);
	});
});
