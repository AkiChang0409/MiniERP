import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { timeFields } from '$platform/modules/schema-helpers';
import { persons } from './person.schema';

// ---------------------------------------------------------------------------
// Leave Types (master data)
// ---------------------------------------------------------------------------

export const leaveTypes = sqliteTable('leave_types', {
	id: text('id').primaryKey(),
	code: text('code').notNull().unique(),
	name: text('name').notNull(),
	description: text('description'),
	isPaid: integer('is_paid', { mode: 'boolean' }).notNull().default(true),
	requiresDocument: integer('requires_document', { mode: 'boolean' }).notNull().default(false),
	requiresApproval: integer('requires_approval', { mode: 'boolean' }).notNull().default(true),
	/** When true, approved Unpaid Leave triggers payrollEffect = 'pending_export' */
	affectsPayroll: integer('affects_payroll', { mode: 'boolean' }).notNull().default(false),
	status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
	...timeFields
});

// ---------------------------------------------------------------------------
// Leave Requests
// ---------------------------------------------------------------------------

export const leaveRequests = sqliteTable('leave_requests', {
	id: text('id').primaryKey(),
	personId: text('person_id')
		.notNull()
		.references(() => persons.id),
	leaveTypeId: text('leave_type_id')
		.notNull()
		.references(() => leaveTypes.id),
	startDate: text('start_date').notNull(),
	endDate: text('end_date').notNull(),
	totalDays: real('total_days').notNull(),
	status: text('status', {
		enum: ['pending', 'approved', 'rejected', 'cancelled']
	})
		.notNull()
		.default('pending'),
	reason: text('reason'),
	source: text('source', {
		enum: ['mock', 'manual', 'employee_portal', 'imported']
	})
		.notNull()
		.default('manual'),
	submittedAt: text('submitted_at').notNull().default(sql`CURRENT_TIMESTAMP`),
	approvedByUserId: text('approved_by_user_id'),
	approvedAt: text('approved_at'),
	rejectedByUserId: text('rejected_by_user_id'),
	rejectedAt: text('rejected_at'),
	rejectionReason: text('rejection_reason'),
	/** Payroll integration hook — set on approve based on leaveType.affectsPayroll */
	payrollEffect: text('payroll_effect', {
		enum: ['not_applicable', 'pending_export', 'exported']
	})
		.notNull()
		.default('not_applicable'),
	...timeFields
});

// ---------------------------------------------------------------------------
// Leave Balances (per person, per leave type, per year)
// Unique constraint: one row per personId + leaveTypeId + year
// ---------------------------------------------------------------------------

export const leaveBalances = sqliteTable(
	'leave_balances',
	{
		id: text('id').primaryKey(),
		personId: text('person_id')
			.notNull()
			.references(() => persons.id),
		leaveTypeId: text('leave_type_id')
			.notNull()
			.references(() => leaveTypes.id),
		year: integer('year').notNull(),
		entitledDays: real('entitled_days').notNull().default(0),
		usedDays: real('used_days').notNull().default(0),
		pendingDays: real('pending_days').notNull().default(0),
		// remainingDays is computed in service: entitledDays - usedDays - pendingDays
		...timeFields
	},
	(t) => [
		uniqueIndex('leave_balances_person_type_year_uniq').on(t.personId, t.leaveTypeId, t.year)
	]
);

// ---------------------------------------------------------------------------
// Leave Approval Records (audit trail for every status transition)
// ---------------------------------------------------------------------------

export const leaveApprovalRecords = sqliteTable('leave_approval_records', {
	id: text('id').primaryKey(),
	leaveRequestId: text('leave_request_id')
		.notNull()
		.references(() => leaveRequests.id),
	action: text('action', { enum: ['approved', 'rejected', 'cancelled'] }).notNull(),
	actorId: text('actor_id'),
	actorName: text('actor_name'),
	fromStatus: text('from_status').notNull(),
	toStatus: text('to_status').notNull(),
	comment: text('comment'),
	...timeFields
});
