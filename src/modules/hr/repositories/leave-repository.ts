import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { BaseRepository } from '$platform/modules/base-repository';
import type { DBClient } from '$infrastructure/db';
import {
	leaveApprovalRecords,
	leaveBalances,
	leaveRequests,
	leaveTypes
} from './leave.schema';

// ---------------------------------------------------------------------------
// Leave Type Repository
// ---------------------------------------------------------------------------

export class LeaveTypeRepository extends BaseRepository<typeof leaveTypes> {
	constructor(db: DBClient) {
		super(db, leaveTypes);
	}

	async findAllActive() {
		return this.db
			.select()
			.from(leaveTypes)
			.where(and(isNull(leaveTypes.deletedAt), eq(leaveTypes.status, 'active')))
			.orderBy(asc(leaveTypes.code));
	}
}

// ---------------------------------------------------------------------------
// Leave Request Repository
// ---------------------------------------------------------------------------

export class LeaveRequestRepository extends BaseRepository<typeof leaveRequests> {
	constructor(db: DBClient) {
		super(db, leaveRequests);
	}

	async findByFilters(filters: { status?: string; leaveTypeId?: string }) {
		const conditions: ReturnType<typeof eq>[] = [];
		if (filters.status) {
			conditions.push(
				eq(
					leaveRequests.status,
					filters.status as 'pending' | 'approved' | 'rejected' | 'cancelled'
				)
			);
		}
		if (filters.leaveTypeId) {
			conditions.push(eq(leaveRequests.leaveTypeId, filters.leaveTypeId));
		}

		return this.db
			.select()
			.from(leaveRequests)
			.where(
				conditions.length > 0
					? and(isNull(leaveRequests.deletedAt), ...conditions)
					: isNull(leaveRequests.deletedAt)
			)
			.orderBy(desc(leaveRequests.submittedAt));
	}
}

// ---------------------------------------------------------------------------
// Leave Balance Repository
// ---------------------------------------------------------------------------

export class LeaveBalanceRepository extends BaseRepository<typeof leaveBalances> {
	constructor(db: DBClient) {
		super(db, leaveBalances);
	}

	async findByPersonTypeYear(personId: string, leaveTypeId: string, year: number) {
		const rows = await this.db
			.select()
			.from(leaveBalances)
			.where(
				and(
					isNull(leaveBalances.deletedAt),
					eq(leaveBalances.personId, personId),
					eq(leaveBalances.leaveTypeId, leaveTypeId),
					eq(leaveBalances.year, year)
				)
			)
			.limit(1);
		return rows[0] ?? null;
	}
}

// ---------------------------------------------------------------------------
// Leave Approval Record Repository
// ---------------------------------------------------------------------------

export class LeaveApprovalRecordRepository extends BaseRepository<typeof leaveApprovalRecords> {
	constructor(db: DBClient) {
		super(db, leaveApprovalRecords);
	}

	async findByLeaveRequestId(leaveRequestId: string) {
		return this.db
			.select()
			.from(leaveApprovalRecords)
			.where(
				and(
					isNull(leaveApprovalRecords.deletedAt),
					eq(leaveApprovalRecords.leaveRequestId, leaveRequestId)
				)
			)
			.orderBy(desc(leaveApprovalRecords.createdAt));
	}
}
