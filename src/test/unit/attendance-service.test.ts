import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoist mock functions so they are available inside vi.mock factory ─────────
const { mockFindByFilters, mockFindPersonName } = vi.hoisted(() => ({
	mockFindByFilters: vi.fn(),
	mockFindPersonName: vi.fn()
}));

// ── Mock AttendanceRepository ──────────────────────────────────────────────────
vi.mock('$modules/hr/repositories/attendance-repository', () => ({
	AttendanceRepository: vi.fn().mockImplementation(() => ({
		findByFilters: mockFindByFilters,
		findPersonName: mockFindPersonName
	}))
}));

import {
	AttendanceService,
	AttendanceValidationError,
	resolvePayrollEffect
} from '$modules/hr/services/attendance-service';
import type { ModuleContext } from '$platform/modules/types';

// ── Context factory ───────────────────────────────────────────────────────────

function makeCtx(): ModuleContext {
	return {
		db: {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([])
				})
			})
		} as any,
		user: { id: 'u1', email: 'hr@test.com', roles: ['owner' as const] },
		env: {} as any,
		eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn(), emitAsync: vi.fn() }
	};
}

// ── Fake row factory (matches AttendanceRepository.findByFilters return type) ──

type FakeRow = {
	id: string;
	personId: string;
	personName: string | null;
	workDate: string;
	checkInTime: string | null;
	checkOutTime: string | null;
	workedMinutes: number | null;
	lateMinutes: number;
	earlyLeaveMinutes: number;
	overtimeMinutes: number;
	status: 'present' | 'late' | 'absent' | 'on_leave' | 'missing_checkout' | 'rest_day';
	source: string;
	payrollEffect: 'not_applicable' | 'pending_review' | 'pending_export' | 'exported';
	notes: string | null;
};

let _rowId = 0;

function makeRow(overrides: Partial<FakeRow> = {}): FakeRow {
	_rowId++;
	return {
		id: `row-${_rowId}`,
		personId: 'p1',
		personName: 'Alice',
		workDate: '2026-05-05', // Tuesday — week 2026-05-04
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
		...overrides
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	_rowId = 0;
});

// ── resolvePayrollEffect (pure function) ──────────────────────────────────────

describe('resolvePayrollEffect', () => {
	it.each([
		['present', 'not_applicable'],
		['on_leave', 'not_applicable'],
		['rest_day', 'not_applicable'],
		['late', 'pending_review'],
		['absent', 'pending_review'],
		['missing_checkout', 'pending_review']
	] as const)('%s → %s', (status, expected) => {
		expect(resolvePayrollEffect(status)).toBe(expected);
	});
});

// ── AttendanceValidationError ─────────────────────────────────────────────────

describe('AttendanceValidationError', () => {
	it('has name "AttendanceValidationError"', () => {
		expect(new AttendanceValidationError('test').name).toBe('AttendanceValidationError');
	});

	it('preserves message', () => {
		expect(new AttendanceValidationError('custom msg').message).toBe('custom msg');
	});

	it('is an instance of Error', () => {
		expect(new AttendanceValidationError('x')).toBeInstanceOf(Error);
	});
});

// ── listWeeklyAttendanceSummary — empty ───────────────────────────────────────

describe('listWeeklyAttendanceSummary — empty result', () => {
	it('returns [] when repo returns no rows', async () => {
		mockFindByFilters.mockResolvedValue([]);
		const svc = new AttendanceService(makeCtx());
		const result = await svc.listWeeklyAttendanceSummary();
		expect(result).toEqual([]);
	});
});

// ── listWeeklyAttendanceSummary — single week, all statuses ──────────────────

describe('listWeeklyAttendanceSummary — single employee, single week', () => {
	it('counts each status correctly', async () => {
		// Week 2026-05-04 (Mon) to 2026-05-10 (Sun)
		mockFindByFilters.mockResolvedValue([
			makeRow({ workDate: '2026-05-04', status: 'present', workedMinutes: 540, payrollEffect: 'not_applicable' }),
			makeRow({ workDate: '2026-05-05', status: 'late', workedMinutes: 510, lateMinutes: 30, payrollEffect: 'pending_review' }),
			makeRow({ workDate: '2026-05-06', status: 'absent', workedMinutes: null, payrollEffect: 'pending_review' }),
			makeRow({ workDate: '2026-05-07', status: 'on_leave', workedMinutes: null, payrollEffect: 'not_applicable' }),
			makeRow({ workDate: '2026-05-08', status: 'missing_checkout', workedMinutes: null, payrollEffect: 'pending_review' }),
			makeRow({ workDate: '2026-05-09', status: 'rest_day', workedMinutes: null, payrollEffect: 'not_applicable' }),
			makeRow({ workDate: '2026-05-10', status: 'rest_day', workedMinutes: null, payrollEffect: 'not_applicable' })
		]);
		const svc = new AttendanceService(makeCtx());
		const [summary] = await svc.listWeeklyAttendanceSummary();

		expect(summary.presentCount).toBe(1);
		expect(summary.lateCount).toBe(1);
		expect(summary.absentCount).toBe(1);
		expect(summary.onLeaveCount).toBe(1);
		expect(summary.missingCheckoutCount).toBe(1);
		expect(summary.restDayCount).toBe(2);
		expect(summary.totalRecords).toBe(7);
	});

	it('sums workedMinutes (null counts as 0)', async () => {
		mockFindByFilters.mockResolvedValue([
			makeRow({ workDate: '2026-05-04', status: 'present', workedMinutes: 540 }),
			makeRow({ workDate: '2026-05-05', status: 'late', workedMinutes: 510 }),
			makeRow({ workDate: '2026-05-06', status: 'absent', workedMinutes: null })
		]);
		const svc = new AttendanceService(makeCtx());
		const [summary] = await svc.listWeeklyAttendanceSummary();
		expect(summary.totalWorkedMinutes).toBe(1050); // 540 + 510 + 0
	});

	it('sums overtimeMinutes', async () => {
		mockFindByFilters.mockResolvedValue([
			makeRow({ workDate: '2026-05-04', overtimeMinutes: 120 }),
			makeRow({ workDate: '2026-05-05', overtimeMinutes: 0 }),
			makeRow({ workDate: '2026-05-06', overtimeMinutes: 30 })
		]);
		const svc = new AttendanceService(makeCtx());
		const [summary] = await svc.listWeeklyAttendanceSummary();
		expect(summary.totalOvertimeMinutes).toBe(150);
	});

	it('counts payrollReviewCount for pending_review records only', async () => {
		mockFindByFilters.mockResolvedValue([
			makeRow({ workDate: '2026-05-04', payrollEffect: 'not_applicable' }),
			makeRow({ workDate: '2026-05-05', payrollEffect: 'pending_review' }),
			makeRow({ workDate: '2026-05-06', payrollEffect: 'pending_review' }),
			makeRow({ workDate: '2026-05-07', payrollEffect: 'pending_export' }),
			makeRow({ workDate: '2026-05-08', payrollEffect: 'exported' })
		]);
		const svc = new AttendanceService(makeCtx());
		const [summary] = await svc.listWeeklyAttendanceSummary();
		expect(summary.payrollReviewCount).toBe(2);
	});

	it('sets weekStart to Monday and weekEnd to Sunday', async () => {
		// Saturday 2026-05-09 should resolve to week 2026-05-04 ↔ 2026-05-10
		mockFindByFilters.mockResolvedValue([
			makeRow({ workDate: '2026-05-09' }) // Saturday
		]);
		const svc = new AttendanceService(makeCtx());
		const [summary] = await svc.listWeeklyAttendanceSummary();
		expect(summary.weekStart).toBe('2026-05-04');
		expect(summary.weekEnd).toBe('2026-05-10');
	});

	it('uses personId as employeeName fallback when personName is null', async () => {
		mockFindByFilters.mockResolvedValue([
			makeRow({ personId: 'p-unknown', personName: null, workDate: '2026-05-05' })
		]);
		const svc = new AttendanceService(makeCtx());
		const [summary] = await svc.listWeeklyAttendanceSummary();
		expect(summary.employeeName).toBe('p-unknown');
	});
});

// ── listWeeklyAttendanceSummary — cross-week grouping ─────────────────────────

describe('listWeeklyAttendanceSummary — cross-week grouping', () => {
	it('groups records across two weeks into separate rows', async () => {
		mockFindByFilters.mockResolvedValue([
			makeRow({ workDate: '2026-05-04' }), // Week 1: Mon
			makeRow({ workDate: '2026-05-06' }), // Week 1: Wed
			makeRow({ workDate: '2026-05-11' }), // Week 2: Mon
			makeRow({ workDate: '2026-05-13' })  // Week 2: Wed
		]);
		const svc = new AttendanceService(makeCtx());
		const result = await svc.listWeeklyAttendanceSummary();
		expect(result).toHaveLength(2);
		expect(result[0].weekStart).toBe('2026-05-11'); // DESC: newer first
		expect(result[1].weekStart).toBe('2026-05-04');
	});

	it('assigns Sunday to the preceding Monday\'s week', async () => {
		mockFindByFilters.mockResolvedValue([
			makeRow({ workDate: '2026-05-10' }), // Sunday → week of 2026-05-04
			makeRow({ workDate: '2026-05-11' })  // Monday → new week 2026-05-11
		]);
		const svc = new AttendanceService(makeCtx());
		const result = await svc.listWeeklyAttendanceSummary();
		expect(result).toHaveLength(2);
		const [newer, older] = result;
		expect(newer.weekStart).toBe('2026-05-11');
		expect(older.weekStart).toBe('2026-05-04');
	});
});

// ── listWeeklyAttendanceSummary — multiple employees ─────────────────────────

describe('listWeeklyAttendanceSummary — multiple employees', () => {
	it('creates a separate row per employee per week', async () => {
		mockFindByFilters.mockResolvedValue([
			makeRow({ personId: 'p1', personName: 'Alice', workDate: '2026-05-04' }),
			makeRow({ personId: 'p2', personName: 'Bob', workDate: '2026-05-04' })
		]);
		const svc = new AttendanceService(makeCtx());
		const result = await svc.listWeeklyAttendanceSummary();
		expect(result).toHaveLength(2);
		expect(result.map((r) => r.personId).sort()).toEqual(['p1', 'p2']);
	});

	it('sorts within same week by employeeName ASC', async () => {
		mockFindByFilters.mockResolvedValue([
			makeRow({ personId: 'p2', personName: 'Zara', workDate: '2026-05-04' }),
			makeRow({ personId: 'p1', personName: 'Alice', workDate: '2026-05-05' })
		]);
		const svc = new AttendanceService(makeCtx());
		const result = await svc.listWeeklyAttendanceSummary();
		expect(result[0].employeeName).toBe('Alice');
		expect(result[1].employeeName).toBe('Zara');
	});

	it('sorts two weeks × two employees: weekStart DESC then employeeName ASC', async () => {
		mockFindByFilters.mockResolvedValue([
			makeRow({ personId: 'p1', personName: 'Alice', workDate: '2026-05-04' }), // week1
			makeRow({ personId: 'p2', personName: 'Bob', workDate: '2026-05-04' }),   // week1
			makeRow({ personId: 'p1', personName: 'Alice', workDate: '2026-05-11' }), // week2
			makeRow({ personId: 'p2', personName: 'Bob', workDate: '2026-05-11' })    // week2
		]);
		const svc = new AttendanceService(makeCtx());
		const result = await svc.listWeeklyAttendanceSummary();
		expect(result.map((r) => `${r.weekStart}/${r.employeeName}`)).toEqual([
			'2026-05-11/Alice',
			'2026-05-11/Bob',
			'2026-05-04/Alice',
			'2026-05-04/Bob'
		]);
	});

	it('keeps per-employee counts isolated across employees in the same week', async () => {
		mockFindByFilters.mockResolvedValue([
			makeRow({ personId: 'p1', personName: 'Alice', workDate: '2026-05-04', status: 'present', workedMinutes: 540 }),
			makeRow({ personId: 'p1', personName: 'Alice', workDate: '2026-05-05', status: 'late', workedMinutes: 510, payrollEffect: 'pending_review' }),
			makeRow({ personId: 'p2', personName: 'Bob', workDate: '2026-05-04', status: 'absent', workedMinutes: null, payrollEffect: 'pending_review' })
		]);
		const svc = new AttendanceService(makeCtx());
		const result = await svc.listWeeklyAttendanceSummary();
		const alice = result.find((r) => r.personId === 'p1')!;
		const bob = result.find((r) => r.personId === 'p2')!;

		expect(alice.presentCount).toBe(1);
		expect(alice.lateCount).toBe(1);
		expect(alice.absentCount).toBe(0);
		expect(alice.totalWorkedMinutes).toBe(1050);
		expect(alice.payrollReviewCount).toBe(1);

		expect(bob.presentCount).toBe(0);
		expect(bob.absentCount).toBe(1);
		expect(bob.totalWorkedMinutes).toBe(0);
		expect(bob.payrollReviewCount).toBe(1);
	});
});

// ── getPersonNameById ─────────────────────────────────────────────────────────

describe('AttendanceService.getPersonNameById', () => {
	it('returns the name from repo', async () => {
		mockFindPersonName.mockResolvedValue('Carol Wong');
		const svc = new AttendanceService(makeCtx());
		const name = await svc.getPersonNameById('p-carol');
		expect(name).toBe('Carol Wong');
		expect(mockFindPersonName).toHaveBeenCalledWith('p-carol');
	});

	it('returns null for unknown person', async () => {
		mockFindPersonName.mockResolvedValue(null);
		const svc = new AttendanceService(makeCtx());
		const name = await svc.getPersonNameById('p-ghost');
		expect(name).toBeNull();
	});
});

// ── listAttendanceRecords ─────────────────────────────────────────────────────

describe('AttendanceService.listAttendanceRecords', () => {
	it('delegates to repo.findByFilters with all provided filters', async () => {
		const rows = [makeRow()];
		mockFindByFilters.mockResolvedValue(rows);
		const svc = new AttendanceService(makeCtx());
		const filters = { personId: 'p1', weekStart: '2026-05-04', weekEnd: '2026-05-10', status: 'present', source: 'mock' };
		const result = await svc.listAttendanceRecords(filters);
		expect(mockFindByFilters).toHaveBeenCalledWith(filters);
		expect(result).toBe(rows);
	});

	it('returns empty array when no records found', async () => {
		mockFindByFilters.mockResolvedValue([]);
		const svc = new AttendanceService(makeCtx());
		const result = await svc.listAttendanceRecords({ personId: 'nobody' });
		expect(result).toEqual([]);
	});
});
