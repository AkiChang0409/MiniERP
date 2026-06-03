import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
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
import { attendanceRecords } from '../repositories/attendance.schema';
import { AttendanceRepository } from '../repositories/attendance-repository';

// ---------------------------------------------------------------------------
// Leave → Attendance sync helpers
// ---------------------------------------------------------------------------

/**
 * Returns every calendar date (YYYY-MM-DD) in [startDate, endDate] inclusive.
 * Uses UTC to avoid DST shifts.
 */
function expandDateRange(startDate: string, endDate: string): string[] {
	const dates: string[] = [];
	const d = new Date(startDate + 'T00:00:00Z');
	const end = new Date(endDate + 'T00:00:00Z');
	while (d <= end) {
		dates.push(d.toISOString().slice(0, 10));
		d.setUTCDate(d.getUTCDate() + 1);
	}
	return dates;
}

/**
 * Sources whose attendance records may be overwritten by a leave sync.
 * Real punch-in sources (mobile / terminal / employee_portal) are intentionally
 * excluded — overwriting verified punch data would be misleading.
 */
const OVERRIDABLE_SOURCES = new Set(['mock', 'manual', 'leave_sync']);

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

		// Sync attendance records for every date in the leave range.
		// This is best-effort derived data; the leave approval above already committed.
		await this.syncLeaveToAttendance(request.personId, request.startDate, request.endDate, id);
	}

	/**
	 * Writes (insert or update) one attendance_record per calendar date in the
	 * leave range, setting status = 'on_leave', source = 'leave_sync'.
	 *
	 * Overwrite policy:
	 *   - No existing record → INSERT
	 *   - Existing record with source in OVERRIDABLE_SOURCES → UPDATE
	 *   - Existing record with source in (mobile / terminal / employee_portal) → skip
	 *     (TODO: flag conflict for HR review in a future iteration)
	 *
	 * payroll_effect is always 'not_applicable' regardless of leave type — Unpaid
	 * Leave's payroll impact is handled exclusively by leave_requests.payroll_effect.
	 */
	private async syncLeaveToAttendance(
		personId: string,
		startDate: string,
		endDate: string,
		leaveRequestId: string
	): Promise<void> {
		const attendanceRepo = new AttendanceRepository(this.db);
		const dates = expandDateRange(startDate, endDate);
		const now = new Date().toISOString();
		const notes = `leave_sync:${leaveRequestId}`;

		const onLeaveFields = {
			status: 'on_leave' as const,
			source: 'leave_sync' as const,
			payrollEffect: 'not_applicable' as const,
			checkInTime: null,
			checkOutTime: null,
			workedMinutes: null,
			lateMinutes: 0,
			earlyLeaveMinutes: 0,
			overtimeMinutes: 0,
			notes,
			updatedAt: now
		};

		for (const workDate of dates) {
			const existing = await attendanceRepo.findByPersonDate(personId, workDate);

			if (!existing) {
				await this.db.insert(attendanceRecords).values({
					id: crypto.randomUUID(),
					personId,
					workDate,
					...onLeaveFields,
					createdAt: now
				});
			} else if (OVERRIDABLE_SOURCES.has(existing.source)) {
				await this.db
					.update(attendanceRecords)
					.set(onLeaveFields)
					.where(eq(attendanceRecords.id, existing.id));
			}
			// source not in OVERRIDABLE_SOURCES (mobile / terminal / employee_portal):
			// TODO: surface as a conflict flag for HR review in a future iteration
		}
	}

	/**
	 * Backfill: sync all approved leave requests that overlap [dateFrom, dateTo]
	 * into attendance_records.  Safe to re-run — idempotent per (personId, workDate).
	 *
	 * Returns the count of leave requests processed.
	 */
	async syncApprovedLeavesToAttendance(dateFrom: string, dateTo: string): Promise<number> {
		// Overlap condition: req.startDate <= dateTo AND req.endDate >= dateFrom
		const approved = await this.db
			.select()
			.from(leaveRequests)
			.where(
				and(
					isNull(leaveRequests.deletedAt),
					eq(leaveRequests.status, 'approved'),
					lte(leaveRequests.startDate, dateTo),
					gte(leaveRequests.endDate, dateFrom)
				)
			);

		for (const req of approved) {
			await this.syncLeaveToAttendance(req.personId, req.startDate, req.endDate, req.id);
		}
		return approved.length;
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
