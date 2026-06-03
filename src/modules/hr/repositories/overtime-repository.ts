import { and, desc, eq, isNull } from 'drizzle-orm';
import { BaseRepository } from '$platform/modules/base-repository';
import type { DBClient } from '$infrastructure/db';
import { overtimeApprovalRecords, overtimeRequests } from './overtime.schema';

// ---------------------------------------------------------------------------
// Overtime Request Repository
// ---------------------------------------------------------------------------

export class OvertimeRequestRepository extends BaseRepository<typeof overtimeRequests> {
	constructor(db: DBClient) {
		super(db, overtimeRequests);
	}

	/** Find an existing (non-deleted) request for a given attendance record. */
	async findByAttendanceRecordId(attendanceRecordId: string) {
		const rows = await this.db
			.select()
			.from(overtimeRequests)
			.where(
				and(
					isNull(overtimeRequests.deletedAt),
					eq(overtimeRequests.attendanceRecordId, attendanceRecordId)
				)
			)
			.limit(1);
		return rows[0] ?? null;
	}
}

// ---------------------------------------------------------------------------
// Overtime Approval Record Repository
// ---------------------------------------------------------------------------

export class OvertimeApprovalRecordRepository extends BaseRepository<
	typeof overtimeApprovalRecords
> {
	constructor(db: DBClient) {
		super(db, overtimeApprovalRecords);
	}

	async findByOvertimeRequestId(overtimeRequestId: string) {
		return this.db
			.select()
			.from(overtimeApprovalRecords)
			.where(
				and(
					isNull(overtimeApprovalRecords.deletedAt),
					eq(overtimeApprovalRecords.overtimeRequestId, overtimeRequestId)
				)
			)
			.orderBy(desc(overtimeApprovalRecords.createdAt));
	}
}
