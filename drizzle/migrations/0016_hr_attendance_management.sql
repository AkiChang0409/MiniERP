-- HR002: Attendance Management
-- Adds attendance_records table.
-- One row per person per work_date. Unique constraint on (person_id, work_date).

CREATE TABLE `attendance_records` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`work_date` text NOT NULL,
	`check_in_time` text,
	`check_out_time` text,
	`worked_minutes` integer,
	`late_minutes` integer NOT NULL DEFAULT 0,
	`early_leave_minutes` integer NOT NULL DEFAULT 0,
	`overtime_minutes` integer NOT NULL DEFAULT 0,
	`status` text NOT NULL DEFAULT 'present',
	`source` text NOT NULL DEFAULT 'manual',
	`payroll_effect` text NOT NULL DEFAULT 'not_applicable',
	`notes` text,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text,
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_person_date_uniq` ON `attendance_records` (`person_id`, `work_date`);
