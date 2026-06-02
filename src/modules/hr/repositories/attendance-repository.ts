import { and, asc, between, eq, gte, isNull, lte } from 'drizzle-orm';
import { BaseRepository } from '$platform/modules/base-repository';
import type { DBClient } from '$infrastructure/db';
import { attendanceRecords } from './attendance.schema';
import { persons } from './person.schema';

// ---------------------------------------------------------------------------
// Attendance Repository
// ---------------------------------------------------------------------------

export class AttendanceRepository extends BaseRepository<typeof attendanceRecords> {
	constructor(db: DBClient) {
		super(db, attendanceRecords);
	}

	async findByFilters(filters: {
		dateFrom?: string;
		dateTo?: string;
		weekStart?: string;
		weekEnd?: string;
		personId?: string;
		status?: string;
		source?: string;
	}) {
		const conditions: ReturnType<typeof eq>[] = [isNull(attendanceRecords.deletedAt) as ReturnType<typeof eq>];

		if (filters.personId) {
			conditions.push(eq(attendanceRecords.personId, filters.personId));
		}

		if (filters.weekStart && filters.weekEnd) {
			conditions.push(gte(attendanceRecords.workDate, filters.weekStart) as ReturnType<typeof eq>);
			conditions.push(lte(attendanceRecords.workDate, filters.weekEnd) as ReturnType<typeof eq>);
		} else {
			if (filters.dateFrom) {
				conditions.push(gte(attendanceRecords.workDate, filters.dateFrom) as ReturnType<typeof eq>);
			}
			if (filters.dateTo) {
				conditions.push(lte(attendanceRecords.workDate, filters.dateTo) as ReturnType<typeof eq>);
			}
		}

		if (filters.status) {
			conditions.push(
				eq(
					attendanceRecords.status,
					filters.status as
						| 'present'
						| 'late'
						| 'absent'
						| 'on_leave'
						| 'missing_checkout'
						| 'rest_day'
				)
			);
		}

		if (filters.source) {
			conditions.push(
				eq(
					attendanceRecords.source,
					filters.source as
						| 'mock'
						| 'manual'
						| 'leave_sync'
						| 'employee_portal'
						| 'mobile'
						| 'terminal'
						| 'imported'
				)
			);
		}

		return this.db
			.select({
				id: attendanceRecords.id,
				personId: attendanceRecords.personId,
				personName: persons.name,
				workDate: attendanceRecords.workDate,
				checkInTime: attendanceRecords.checkInTime,
				checkOutTime: attendanceRecords.checkOutTime,
				workedMinutes: attendanceRecords.workedMinutes,
				lateMinutes: attendanceRecords.lateMinutes,
				earlyLeaveMinutes: attendanceRecords.earlyLeaveMinutes,
				overtimeMinutes: attendanceRecords.overtimeMinutes,
				status: attendanceRecords.status,
				source: attendanceRecords.source,
				payrollEffect: attendanceRecords.payrollEffect,
				notes: attendanceRecords.notes
			})
			.from(attendanceRecords)
			.innerJoin(persons, eq(attendanceRecords.personId, persons.id))
			.where(and(...conditions))
			.orderBy(asc(attendanceRecords.workDate), asc(persons.name));
	}

	/** Find an existing record by (personId, workDate) for overwrite checks. */
	async findByPersonDate(personId: string, workDate: string) {
		const rows = await this.db
			.select()
			.from(attendanceRecords)
			.where(
				and(
					isNull(attendanceRecords.deletedAt),
					eq(attendanceRecords.personId, personId),
					eq(attendanceRecords.workDate, workDate)
				)
			)
			.limit(1);
		return rows[0] ?? null;
	}

	async findPersonName(personId: string): Promise<string | null> {
		const rows = await this.db
			.select({ name: persons.name })
			.from(persons)
			.where(and(eq(persons.id, personId), isNull(persons.deletedAt)))
			.limit(1);
		return rows[0]?.name ?? null;
	}
}
