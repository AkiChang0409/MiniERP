import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { ModuleContext } from '$platform/modules/types';
import {
	leaveApprovalRecords,
	leaveBalances,
	leaveRequests,
	leaveTypes
} from '../repositories/leave.schema';
import { persons } from '../repositories/person.schema';
import {
	LeaveApprovalRecordRepository,
	LeaveBalanceRepository,
	LeaveRequestRepository,
	LeaveTypeRepository
} from '../repositories/leave-repository';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class LeaveValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LeaveValidationError';
	}
}

// ---------------------------------------------------------------------------
// LeaveService
// ---------------------------------------------------------------------------

export class LeaveService {
	private db: ModuleContext['db'];
	private user: ModuleContext['user'];
	private leaveTypeRepo: LeaveTypeRepository;
	private leaveRequestRepo: LeaveRequestRepository;
	private leaveBalanceRepo: LeaveBalanceRepository;
	private leaveApprovalRepo: LeaveApprovalRecordRepository;

	constructor(ctx: ModuleContext) {
		this.db = ctx.db;
		this.user = ctx.user;
		this.leaveTypeRepo = new LeaveTypeRepository(ctx.db);
		this.leaveRequestRepo = new LeaveRequestRepository(ctx.db);
		this.leaveBalanceRepo = new LeaveBalanceRepository(ctx.db);
		this.leaveApprovalRepo = new LeaveApprovalRecordRepository(ctx.db);
	}

	async listLeaveTypes() {
		return this.leaveTypeRepo.findAllActive();
	}

	async listLeaveRequests(filters: { status?: string; leaveTypeId?: string } = {}) {
		const conditions = [isNull(leaveRequests.deletedAt)];
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
			.select({
				id: leaveRequests.id,
				personId: leaveRequests.personId,
				personName: persons.name,
				leaveTypeId: leaveRequests.leaveTypeId,
				leaveTypeName: leaveTypes.name,
				leaveTypeCode: leaveTypes.code,
				startDate: leaveRequests.startDate,
				endDate: leaveRequests.endDate,
				totalDays: leaveRequests.totalDays,
				status: leaveRequests.status,
				reason: leaveRequests.reason,
				source: leaveRequests.source,
				submittedAt: leaveRequests.submittedAt,
				approvedByUserId: leaveRequests.approvedByUserId,
				approvedAt: leaveRequests.approvedAt,
				rejectedByUserId: leaveRequests.rejectedByUserId,
				rejectedAt: leaveRequests.rejectedAt,
				rejectionReason: leaveRequests.rejectionReason,
				payrollEffect: leaveRequests.payrollEffect
			})
			.from(leaveRequests)
			.innerJoin(persons, eq(leaveRequests.personId, persons.id))
			.innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
			.where(and(...conditions))
			.orderBy(desc(leaveRequests.submittedAt));
	}

	async approveLeaveRequest(id: string, comment?: string) {
		const request = await this.leaveRequestRepo.findById(id);
		if (!request) throw new LeaveValidationError('Leave request not found');
		if (request.status !== 'pending')
			throw new LeaveValidationError('Only pending requests can be approved');

		const leaveType = await this.leaveTypeRepo.findById(request.leaveTypeId);
		if (!leaveType) throw new LeaveValidationError('Leave type not found');

		const now = new Date().toISOString();
		const year = new Date(request.startDate).getFullYear();
		const actorId = this.user?.id ?? null;
		const actorName = this.user?.email ?? null;
		const payrollEffect: 'pending_export' | 'not_applicable' = leaveType.affectsPayroll
			? 'pending_export'
			: 'not_applicable';

		// Atomic batch: all three writes succeed or none
		await (
			this.db.batch as (
				stmts: Parameters<typeof this.db.batch>[0]
			) => ReturnType<typeof this.db.batch>
		)([
			this.db
				.update(leaveRequests)
				.set({ status: 'approved', approvedByUserId: actorId, approvedAt: now, payrollEffect, updatedAt: now })
				.where(and(eq(leaveRequests.id, id), isNull(leaveRequests.deletedAt))),
			this.db
				.update(leaveBalances)
				.set({
					pendingDays: sql`${leaveBalances.pendingDays} - ${request.totalDays}`,
					usedDays: sql`${leaveBalances.usedDays} + ${request.totalDays}`,
					updatedAt: now
				})
				.where(
					and(
						isNull(leaveBalances.deletedAt),
						eq(leaveBalances.personId, request.personId),
						eq(leaveBalances.leaveTypeId, request.leaveTypeId),
						eq(leaveBalances.year, year)
					)
				),
			this.db.insert(leaveApprovalRecords).values({
				id: crypto.randomUUID(),
				leaveRequestId: id,
				action: 'approved',
				actorId,
				actorName,
				fromStatus: 'pending',
				toStatus: 'approved',
				comment: comment ?? null,
				createdAt: now,
				updatedAt: now
			})
		]);
	}

	async rejectLeaveRequest(id: string, reason: string) {
		const request = await this.leaveRequestRepo.findById(id);
		if (!request) throw new LeaveValidationError('Leave request not found');
		if (request.status !== 'pending')
			throw new LeaveValidationError('Only pending requests can be rejected');

		const now = new Date().toISOString();
		const year = new Date(request.startDate).getFullYear();
		const actorId = this.user?.id ?? null;
		const actorName = this.user?.email ?? null;

		// Atomic batch: all three writes succeed or none
		await (
			this.db.batch as (
				stmts: Parameters<typeof this.db.batch>[0]
			) => ReturnType<typeof this.db.batch>
		)([
			this.db
				.update(leaveRequests)
				.set({
					status: 'rejected',
					rejectedByUserId: actorId,
					rejectedAt: now,
					rejectionReason: reason,
					updatedAt: now
				})
				.where(and(eq(leaveRequests.id, id), isNull(leaveRequests.deletedAt))),
			this.db
				.update(leaveBalances)
				.set({
					pendingDays: sql`${leaveBalances.pendingDays} - ${request.totalDays}`,
					updatedAt: now
				})
				.where(
					and(
						isNull(leaveBalances.deletedAt),
						eq(leaveBalances.personId, request.personId),
						eq(leaveBalances.leaveTypeId, request.leaveTypeId),
						eq(leaveBalances.year, year)
					)
				),
			this.db.insert(leaveApprovalRecords).values({
				id: crypto.randomUUID(),
				leaveRequestId: id,
				action: 'rejected',
				actorId,
				actorName,
				fromStatus: 'pending',
				toStatus: 'rejected',
				comment: reason,
				createdAt: now,
				updatedAt: now
			})
		]);
	}

	async listLeaveBalances(year?: number) {
		const targetYear = year ?? new Date().getFullYear();

		const rows = await this.db
			.select({
				id: leaveBalances.id,
				personId: leaveBalances.personId,
				personName: persons.name,
				leaveTypeId: leaveBalances.leaveTypeId,
				leaveTypeName: leaveTypes.name,
				leaveTypeCode: leaveTypes.code,
				year: leaveBalances.year,
				entitledDays: leaveBalances.entitledDays,
				usedDays: leaveBalances.usedDays,
				pendingDays: leaveBalances.pendingDays
			})
			.from(leaveBalances)
			.innerJoin(persons, eq(leaveBalances.personId, persons.id))
			.innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
			.where(and(isNull(leaveBalances.deletedAt), eq(leaveBalances.year, targetYear)))
			.orderBy(asc(persons.name), asc(leaveTypes.code));

		return rows.map((row) => ({
			...row,
			remainingDays: row.entitledDays - row.usedDays - row.pendingDays
		}));
	}
}
