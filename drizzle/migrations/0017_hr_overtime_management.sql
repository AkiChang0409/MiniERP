-- HR003: Overtime Management
-- Adds overtime_requests + overtime_approval_records tables.
--
-- overtime_requests: one row per overtime request, generated from an
--   attendance_records row whose overtime_minutes > 0, then approved/rejected.
--   UNIQUE(attendance_record_id) prevents generating two requests from the same
--   attendance record.
-- overtime_approval_records: immutable audit trail (mirrors leave_approval_records).

CREATE TABLE `overtime_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`attendance_record_id` text NOT NULL,
	`work_date` text NOT NULL,
	`overtime_minutes` integer NOT NULL DEFAULT 0,
	`reason` text,
	`status` text NOT NULL DEFAULT 'pending',
	`source` text NOT NULL DEFAULT 'attendance_detected',
	`approved_by_user_id` text,
	`approved_at` text,
	`rejected_by_user_id` text,
	`rejected_at` text,
	`rejection_reason` text,
	`payroll_effect` text NOT NULL DEFAULT 'not_applicable',
	`notes` text,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text,
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attendance_record_id`) REFERENCES `attendance_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `overtime_attendance_record_uniq` ON `overtime_requests` (`attendance_record_id`);
--> statement-breakpoint
CREATE TABLE `overtime_approval_records` (
	`id` text PRIMARY KEY NOT NULL,
	`overtime_request_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` text,
	`actor_name` text,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`comment` text,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text,
	FOREIGN KEY (`overtime_request_id`) REFERENCES `overtime_requests`(`id`) ON UPDATE no action ON DELETE no action
);
