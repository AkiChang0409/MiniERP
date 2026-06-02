import { and, asc, desc, eq, gt, gte, isNull, lte } from 'drizzle-orm';
import type { ModuleContext } from '$platform/modules/types';
import { attendanceRecords } from '../repositories/attendance.schema';
import { overtimeApprovalRecords, overtimeRequests } from '../repositories/overtime.schema';
import { persons } from '../repositories/person.schema';
import {
	OvertimeApprovalRecordRepository,
	OvertimeRequestRepository
} from '../repositories/overtime-repository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OvertimeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type OvertimePayrollEffect = 'not_applicable' | 'pending_export' | 'exported';

export type OvertimeCandidate = {
	attendanceRecordId: string;
	personId: string;
	personName: string;
	workDate: string;
	overtimeMinutes: number;
	checkInTime: string | null;
	checkOutTime: string | null;
	attendanceStatus: string;
	notes: string | null;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class OvertimeValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'OvertimeValidationError';
	}
}

// ---------------------------------------------------------------------------
// OvertimeService
//
// Turns attendance "overtime facts" (attendance_records.overtime_minutes > 0)
// into approved, payroll-ready overtime requests.
//
//   attendance_records.overtime_minutes > 0
//        ↓  (overtime candidate)
//   generateOvertimeRequest        → status=pending,  payroll_effect=not_applicable
//        ↓
//   approveOvertimeRequest         → status=approved, payroll_effect=pending_export
//   rejectOvertimeRequest          → status=rejected, payroll_effect=not_applicable
//        ↓
//   getOvertimePayrollInputs       → approved + pending_export rows for a period
// ---------------------------------------------------------------------------

export class OvertimeService {
	private db: ModuleContext['db'];
	private user: ModuleContext['user'];
	private overtimeRequestRepo: OvertimeRequestRepository;
	private overtimeApprovalRepo: OvertimeApprovalRecordRepository;

	constructor(ctx: ModuleContext) {
		this.db = ctx.db;
		this.user = ctx.user;
		this.overtimeRequestRepo = new OvertimeRequestRepository(ctx.db);
		this.overtimeApprovalRepo = new OvertimeApprovalRecordRepository(ctx.db);
	}

	/**
	 * Overtime candidates: attendance_records with overtime_minutes > 0 that do
	 * NOT yet have an overtime request. Implemented as a LEFT JOIN where the
	 * overtime_requests side is NULL.
	 */
	async listOvertimeCandidates(
		filters: { dateFrom?: string; dateTo?: string; personId?: string } = {}
	): Promise<OvertimeCandidate[]> {
		const conditions = [
			isNull(attendanceRecords.deletedAt),
			gt(attendanceRecords.overtimeMinutes, 0),
			// candidate = no (non-deleted) overtime request exists for this record
			isNull(overtimeRequests.id)
		];

		if (filters.personId) {
			conditions.push(eq(attendanceRecords.personId, filters.personId));
		}
		if (filters.dateFrom) {
			conditions.push(gte(attendanceRecords.workDate, filters.dateFrom));
		}
		if (filters.dateTo) {
			conditions.push(lte(attendanceRecords.workDate, filters.dateTo));
		}

		const rows = await this.db
			.select({
				attendanceRecordId: attendanceRecords.id,
				personId: attendanceRecords.personId,
				personName: persons.name,
				workDate: attendanceRecords.workDate,
				overtimeMinutes: attendanceRecords.overtimeMinutes,
				checkInTime: attendanceRecords.checkInTime,
				checkOutTime: attendanceRecords.checkOutTime,
				attendanceStatus: attendanceRecords.status,
				notes: attendanceRecords.notes
			})
			.from(attendanceRecords)
			.innerJoin(persons, eq(attendanceRecords.personId, persons.id))
			.leftJoin(
				overtimeRequests,
				and(
					eq(overtimeRequests.attendanceRecordId, attendanceRecords.id),
					isNull(overtimeRequests.deletedAt)
				)
			)
			.where(and(...conditions))
			.orderBy(desc(attendanceRecords.workDate), asc(persons.name));

		return rows.map((r) => ({
			...r,
			personName: r.personName ?? r.personId
		}));
	}

	/**
	 * Existing overtime requests (joined with person name) for the admin list.
	 */
	async listOvertimeRequests(filters: { status?: string; personId?: string } = {}) {
		const conditions = [isNull(overtimeRequests.deletedAt)];
		if (filters.status) {
			conditions.push(eq(overtimeRequests.status, filters.status as OvertimeStatus));
		}
		if (filters.personId) {
			conditions.push(eq(overtimeRequests.personId, filters.personId));
		}

		return this.db
			.select({
				id: overtimeRequests.id,
				personId: overtimeRequests.personId,
				personName: persons.name,
				attendanceRecordId: overtimeRequests.attendanceRecordId,
				workDate: overtimeRequests.workDate,
				overtimeMinutes: overtimeRequests.overtimeMinutes,
				reason: overtimeRequests.reason,
				status: overtimeRequests.status,
				source: overtimeRequests.source,
				approvedByUserId: overtimeRequests.approvedByUserId,
				approvedAt: overtimeRequests.approvedAt,
				rejectedByUserId: overtimeRequests.rejectedByUserId,
				rejectedAt: overtimeRequests.rejectedAt,
				rejectionReason: overtimeRequests.rejectionReason,
				payrollEffect: overtimeRequests.payrollEffect,
				notes: overtimeRequests.notes,
				createdAt: overtimeRequests.createdAt
			})
			.from(overtimeRequests)
			.innerJoin(persons, eq(overtimeRequests.personId, persons.id))
			.where(and(...conditions))
			.orderBy(desc(overtimeRequests.workDate), asc(persons.name));
	}

	/**
	 * Generate an overtime request from an attendance record.
	 *
	 * Rules:
	 *   - attendance record must exist
	 *   - overtime_minutes must be > 0
	 *   - one attendance record can produce at most one overtime request
	 *
	 * New request defaults: status=pending, source=attendance_detected,
	 * payroll_effect=not_applicable.
	 *
	 * Returns the newly created request id.
	 */
	async generateOvertimeRequest(attendanceRecordId: string, reason?: string): Promise<string> {
		const record = await this.db
			.select()
			.from(attendanceRecords)
			.where(
				and(eq(attendanceRecords.id, attendanceRecordId), isNull(attendanceRecords.deletedAt))
			)
			.limit(1)
			.then((rows) => rows[0] ?? null);

		if (!record) throw new OvertimeValidationError('Attendance record not found');
		if (record.overtimeMinutes <= 0)
			throw new OvertimeValidationError('Attendance record has no overtime to request');

		const existing = await this.overtimeRequestRepo.findByAttendanceRecordId(attendanceRecordId);
		if (existing)
			throw new OvertimeValidationError(
				'An overtime request already exists for this attendance record'
			);

		const now = new Date().toISOString();
		const id = crypto.randomUUID();

		await this.db.insert(overtimeRequests).values({
			id,
			personId: record.personId,
			attendanceRecordId: record.id,
			workDate: record.workDate,
			overtimeMinutes: record.overtimeMinutes,
			reason: reason ?? null,
			status: 'pending',
			source: 'attendance_detected',
			payrollEffect: 'not_applicable',
			createdAt: now,
			updatedAt: now
		});

		return id;
	}

	/**
	 * Approve a pending overtime request.
	 *   status → approved, payroll_effect → pending_export, snapshot approver,
	 *   and write an overtime_approval_records row — all atomically via db.batch.
	 */
	async approveOvertimeRequest(id: string, comment?: string): Promise<void> {
		const request = await this.overtimeRequestRepo.findById(id);
		if (!request) throw new OvertimeValidationError('Overtime request not found');
		if (request.status !== 'pending')
			throw new OvertimeValidationError('Only pending requests can be approved');

		const now = new Date().toISOString();
		const actorId = this.user?.id ?? null;
		const actorName = this.user?.email ?? null;

		await (
			this.db.batch as (
				stmts: Parameters<typeof this.db.batch>[0]
			) => ReturnType<typeof this.db.batch>
		)([
			this.db
				.update(overtimeRequests)
				.set({
					status: 'approved',
					approvedByUserId: actorId,
					approvedAt: now,
					payrollEffect: 'pending_export',
					updatedAt: now
				})
				.where(and(eq(overtimeRequests.id, id), isNull(overtimeRequests.deletedAt))),
			this.db.insert(overtimeApprovalRecords).values({
				id: crypto.randomUUID(),
				overtimeRequestId: id,
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

	/**
	 * Reject a pending overtime request.
	 *   status → rejected, payroll_effect → not_applicable, snapshot rejecter +
	 *   reason, and write an overtime_approval_records row — atomically.
	 */
	async rejectOvertimeRequest(id: string, reason: string): Promise<void> {
		const request = await this.overtimeRequestRepo.findById(id);
		if (!request) throw new OvertimeValidationError('Overtime request not found');
		if (request.status !== 'pending')
			throw new OvertimeValidationError('Only pending requests can be rejected');

		const now = new Date().toISOString();
		const actorId = this.user?.id ?? null;
		const actorName = this.user?.email ?? null;

		await (
			this.db.batch as (
				stmts: Parameters<typeof this.db.batch>[0]
			) => ReturnType<typeof this.db.batch>
		)([
			this.db
				.update(overtimeRequests)
				.set({
					status: 'rejected',
					rejectedByUserId: actorId,
					rejectedAt: now,
					rejectionReason: reason,
					payrollEffect: 'not_applicable',
					updatedAt: now
				})
				.where(and(eq(overtimeRequests.id, id), isNull(overtimeRequests.deletedAt))),
			this.db.insert(overtimeApprovalRecords).values({
				id: crypto.randomUUID(),
				overtimeRequestId: id,
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

	/**
	 * Payroll integration hook — the ONLY sanctioned source of payable overtime.
	 *
	 * Returns approved overtime requests with payroll_effect = 'pending_export'
	 * whose work_date falls within [periodStart, periodEnd]. Payroll must read
	 * these rows; it must NOT read attendance_records.overtime_minutes directly.
	 *
	 * This MVP does not compute overtime pay amounts.
	 */
	async getOvertimePayrollInputs(periodStart: string, periodEnd: string) {
		return this.db
			.select()
			.from(overtimeRequests)
			.where(
				and(
					isNull(overtimeRequests.deletedAt),
					eq(overtimeRequests.status, 'approved'),
					eq(overtimeRequests.payrollEffect, 'pending_export'),
					gte(overtimeRequests.workDate, periodStart),
					lte(overtimeRequests.workDate, periodEnd)
				)
			)
			.orderBy(asc(overtimeRequests.workDate));
	}
}
