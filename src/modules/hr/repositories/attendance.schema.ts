import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { timeFields } from '$platform/modules/schema-helpers';
import { persons } from './person.schema';

// ---------------------------------------------------------------------------
// Attendance Records
// One row per person per work day.
// ---------------------------------------------------------------------------

export const attendanceRecords = sqliteTable(
	'attendance_records',
	{
		id: text('id').primaryKey(),
		personId: text('person_id')
			.notNull()
			.references(() => persons.id),
		workDate: text('work_date').notNull(), // YYYY-MM-DD

		checkInTime: text('check_in_time'), // HH:MM (nullable — absent/on_leave/rest_day)
		checkOutTime: text('check_out_time'), // HH:MM (nullable — absent/missing_checkout/on_leave/rest_day)

		/**
		 * Gross duration from check_in to check_out in minutes.
		 * Does NOT deduct lunch/break time and is NOT payroll-grade net worked time.
		 * Future: add break_minutes / paid_work_minutes / work_schedule when Payroll needs accuracy.
		 */
		workedMinutes: integer('worked_minutes'), // nullable when no check_out

		lateMinutes: integer('late_minutes').notNull().default(0),
		earlyLeaveMinutes: integer('early_leave_minutes').notNull().default(0),

		/**
		 * Overtime minutes are for display/statistics only in MVP.
		 * Overtime payroll input should come from an Overtime Management approval flow in the future.
		 */
		overtimeMinutes: integer('overtime_minutes').notNull().default(0),

		/**
		 * MVP status enum (6 values). half_day is reserved for future extension.
		 */
		status: text('status', {
			enum: ['present', 'late', 'absent', 'on_leave', 'missing_checkout', 'rest_day']
		})
			.notNull()
			.default('present'),

		source: text('source', {
			enum: ['mock', 'manual', 'leave_sync', 'employee_portal', 'mobile', 'terminal', 'imported']
		})
			.notNull()
			.default('manual'),

		/**
		 * Set by AttendanceService.resolvePayrollEffect — never set directly in Svelte:
		 *   present / on_leave / rest_day → not_applicable
		 *   late / absent / missing_checkout → pending_review
		 */
		payrollEffect: text('payroll_effect', {
			enum: ['not_applicable', 'pending_review', 'pending_export', 'exported']
		})
			.notNull()
			.default('not_applicable'),

		notes: text('notes'),
		...timeFields
	},
	(t) => [uniqueIndex('attendance_person_date_uniq').on(t.personId, t.workDate)]
);
