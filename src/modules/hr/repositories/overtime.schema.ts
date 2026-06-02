import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { timeFields } from '$platform/modules/schema-helpers';
import { persons } from './person.schema';
import { attendanceRecords } from './attendance.schema';

// ---------------------------------------------------------------------------
// Overtime Requests
// One row per overtime request. Generated from an attendance_records row whose
// overtime_minutes > 0, then approved / rejected by HR/Admin.
//
// Design principle: attendance_records.overtime_minutes is only an attendance
// fact ("the system detected possible overtime"). It is NOT company-approved,
// payable overtime. Overtime Management is the approval layer that turns a
// detected candidate into an approved, payroll-ready record.
//
// Future Payroll reads ONLY approved overtime requests
// (status = 'approved' AND payroll_effect = 'pending_export'),
// never attendance_records.overtime_minutes directly.
// ---------------------------------------------------------------------------

export const overtimeRequests = sqliteTable(
	'overtime_requests',
	{
		id: text('id').primaryKey(),
		personId: text('person_id')
			.notNull()
			.references(() => persons.id),
		/**
		 * The attendance record this overtime originated from.
		 * UNIQUE — one attendance record can produce at most one overtime request.
		 */
		attendanceRecordId: text('attendance_record_id')
			.notNull()
			.references(() => attendanceRecords.id),
		workDate: text('work_date').notNull(), // YYYY-MM-DD (snapshot of attendance.work_date)
		/** Snapshot of attendance_records.overtime_minutes at generation time. */
		overtimeMinutes: integer('overtime_minutes').notNull().default(0),
		reason: text('reason'),

		status: text('status', {
			enum: ['pending', 'approved', 'rejected', 'cancelled']
		})
			.notNull()
			.default('pending'),

		source: text('source', {
			enum: ['attendance_detected', 'manual', 'employee_portal', 'imported']
		})
			.notNull()
			.default('attendance_detected'),

		approvedByUserId: text('approved_by_user_id'),
		approvedAt: text('approved_at'),
		rejectedByUserId: text('rejected_by_user_id'),
		rejectedAt: text('rejected_at'),
		rejectionReason: text('rejection_reason'),

		/**
		 * Payroll integration hook — mirrors leave/attendance semantics.
		 *   pending (generated)  → not_applicable
		 *   approved             → pending_export
		 *   rejected / cancelled → not_applicable
		 *   (payroll consumes)   → exported
		 */
		payrollEffect: text('payroll_effect', {
			enum: ['not_applicable', 'pending_export', 'exported']
		})
			.notNull()
			.default('not_applicable'),

		notes: text('notes'),
		...timeFields
	},
	(t) => [uniqueIndex('overtime_attendance_record_uniq').on(t.attendanceRecordId)]
);

// ---------------------------------------------------------------------------
// Overtime Approval Records (immutable audit trail for every status transition)
// One row per approve / reject action (mirrors leave_approval_records).
// ---------------------------------------------------------------------------

export const overtimeApprovalRecords = sqliteTable('overtime_approval_records', {
	id: text('id').primaryKey(),
	overtimeRequestId: text('overtime_request_id')
		.notNull()
		.references(() => overtimeRequests.id),
	action: text('action', { enum: ['approved', 'rejected', 'cancelled'] }).notNull(),
	actorId: text('actor_id'),
	actorName: text('actor_name'),
	fromStatus: text('from_status').notNull(),
	toStatus: text('to_status').notNull(),
	comment: text('comment'),
	...timeFields
});
