import { and, eq, inArray, isNull, gte, lte } from 'drizzle-orm';
import type { ModuleContext } from '$platform/modules/types';
import { attendanceRecords } from '../repositories/attendance.schema';
import { AttendanceRepository } from '../repositories/attendance-repository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AttendanceStatus =
	| 'present'
	| 'late'
	| 'absent'
	| 'on_leave'
	| 'missing_checkout'
	| 'rest_day';

export type AttendancePayrollEffect =
	| 'not_applicable'
	| 'pending_review'
	| 'pending_export'
	| 'exported';

export type WeeklyAttendanceSummary = {
	personId: string;
	employeeName: string;
	weekStart: string;
	weekEnd: string;
	totalRecords: number;
	presentCount: number;
	lateCount: number;
	absentCount: number;
	onLeaveCount: number;
	missingCheckoutCount: number;
	restDayCount: number;
	totalWorkedMinutes: number;
	totalOvertimeMinutes: number;
	/** Count of records with payroll_effect = 'pending_review' */
	payrollReviewCount: number;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AttendanceValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AttendanceValidationError';
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the ISO week start (Monday) for a given date string (YYYY-MM-DD).
 */
function getIsoWeekStart(dateStr: string): string {
	const d = new Date(dateStr + 'T00:00:00Z');
	const day = d.getUTCDay(); // 0=Sun, 1=Mon
	const diff = day === 0 ? -6 : 1 - day;
	d.setUTCDate(d.getUTCDate() + diff);
	return d.toISOString().slice(0, 10);
}

function getIsoWeekEnd(weekStart: string): string {
	const d = new Date(weekStart + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + 6);
	return d.toISOString().slice(0, 10);
}

/**
 * Payroll effect mapping — authoritative rule, defined only here.
 *   present / on_leave / rest_day → not_applicable
 *   late / absent / missing_checkout → pending_review
 */
export function resolvePayrollEffect(status: AttendanceStatus): 'not_applicable' | 'pending_review' {
	if (status === 'present' || status === 'on_leave' || status === 'rest_day') {
		return 'not_applicable';
	}
	return 'pending_review';
}

// ---------------------------------------------------------------------------
// AttendanceService
// ---------------------------------------------------------------------------

export class AttendanceService {
	private db: ModuleContext['db'];
	private repo: AttendanceRepository;

	constructor(ctx: ModuleContext) {
		this.db = ctx.db;
		this.repo = new AttendanceRepository(ctx.db);
	}

	/**
	 * Returns employee-level weekly summaries.
	 * One row = one employee × one ISO week.
	 *
	 * status/source filters are applied at the DB query level before aggregation.
	 * This means the summary reflects only records matching those filters
	 * ("filtered weekly summary"), not a full-week view with some rows highlighted.
	 */
	async listWeeklyAttendanceSummary(
		filters: {
			dateFrom?: string;
			dateTo?: string;
			status?: string;
			source?: string;
		} = {}
	): Promise<WeeklyAttendanceSummary[]> {
		const rows = await this.repo.findByFilters({
			dateFrom: filters.dateFrom,
			dateTo: filters.dateTo,
			status: filters.status,
			source: filters.source
		});

		// Group by (personId, isoWeekStart)
		const map = new Map<
			string,
			{
				personId: string;
				employeeName: string;
				weekStart: string;
				weekEnd: string;
				presentCount: number;
				lateCount: number;
				absentCount: number;
				onLeaveCount: number;
				missingCheckoutCount: number;
				restDayCount: number;
				totalWorkedMinutes: number;
				totalOvertimeMinutes: number;
				payrollReviewCount: number;
			}
		>();

		for (const row of rows) {
			const weekStart = getIsoWeekStart(row.workDate);
			const weekEnd = getIsoWeekEnd(weekStart);
			const key = `${row.personId}::${weekStart}`;

			if (!map.has(key)) {
				map.set(key, {
					personId: row.personId,
					employeeName: row.personName ?? row.personId,
					weekStart,
					weekEnd,
					presentCount: 0,
					lateCount: 0,
					absentCount: 0,
					onLeaveCount: 0,
					missingCheckoutCount: 0,
					restDayCount: 0,
					totalWorkedMinutes: 0,
					totalOvertimeMinutes: 0,
					payrollReviewCount: 0
				});
			}

			const entry = map.get(key)!;

			switch (row.status) {
				case 'present':
					entry.presentCount++;
					break;
				case 'late':
					entry.lateCount++;
					break;
				case 'absent':
					entry.absentCount++;
					break;
				case 'on_leave':
					entry.onLeaveCount++;
					break;
				case 'missing_checkout':
					entry.missingCheckoutCount++;
					break;
				case 'rest_day':
					entry.restDayCount++;
					break;
			}

			entry.totalWorkedMinutes += row.workedMinutes ?? 0;
			entry.totalOvertimeMinutes += row.overtimeMinutes ?? 0;

			if (row.payrollEffect === 'pending_review') {
				entry.payrollReviewCount++;
			}
		}

		return Array.from(map.values())
			.map((entry) => ({
				...entry,
				totalRecords:
					entry.presentCount +
					entry.lateCount +
					entry.absentCount +
					entry.onLeaveCount +
					entry.missingCheckoutCount +
					entry.restDayCount
			}))
			.sort((a, b) => {
				if (b.weekStart !== a.weekStart) return b.weekStart.localeCompare(a.weekStart);
				return a.employeeName.localeCompare(b.employeeName);
			});
	}

	/**
	 * Returns individual daily attendance records with optional filters.
	 * personId should be provided when called from Detail view.
	 */
	async listAttendanceRecords(
		filters: {
			personId?: string;
			weekStart?: string;
			weekEnd?: string;
			dateFrom?: string;
			dateTo?: string;
			status?: string;
			source?: string;
		} = {}
	) {
		return this.repo.findByFilters(filters);
	}

	/**
	 * Looks up the display name for a person by ID.
	 * Used by the Detail view to show the employee name even when records is empty.
	 */
	async getPersonNameById(personId: string): Promise<string | null> {
		return this.repo.findPersonName(personId);
	}

	/**
	 * Payroll integration hook — returns records needing payroll attention.
	 * Payroll module should read these records; it must NOT modify attendance core data.
	 */
	async getAttendancePayrollInputs(periodStart: string, periodEnd: string) {
		const conditions = [
			isNull(attendanceRecords.deletedAt),
			gte(attendanceRecords.workDate, periodStart),
			lte(attendanceRecords.workDate, periodEnd),
			inArray(attendanceRecords.payrollEffect, ['pending_review', 'pending_export'])
		];

		return this.db
			.select()
			.from(attendanceRecords)
			.where(and(...conditions));
	}
}
