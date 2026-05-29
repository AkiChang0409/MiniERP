-- HR001: Leave Management
-- Adds leave_types, leave_requests, leave_balances, leave_approval_records tables.

CREATE TABLE `leave_types` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_paid` integer NOT NULL DEFAULT 1,
	`requires_document` integer NOT NULL DEFAULT 0,
	`requires_approval` integer NOT NULL DEFAULT 1,
	`affects_payroll` integer NOT NULL DEFAULT 0,
	`status` text NOT NULL DEFAULT 'active',
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leave_types_code_unique` ON `leave_types` (`code`);
--> statement-breakpoint
CREATE TABLE `leave_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`leave_type_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`total_days` real NOT NULL,
	`status` text NOT NULL DEFAULT 'pending',
	`reason` text,
	`source` text NOT NULL DEFAULT 'manual',
	`submitted_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`approved_by_user_id` text,
	`approved_at` text,
	`rejected_by_user_id` text,
	`rejected_at` text,
	`rejection_reason` text,
	`payroll_effect` text NOT NULL DEFAULT 'not_applicable',
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text,
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `leave_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`leave_type_id` text NOT NULL,
	`year` integer NOT NULL,
	`entitled_days` real NOT NULL DEFAULT 0,
	`used_days` real NOT NULL DEFAULT 0,
	`pending_days` real NOT NULL DEFAULT 0,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text,
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leave_balances_person_type_year_uniq` ON `leave_balances` (`person_id`, `leave_type_id`, `year`);
--> statement-breakpoint
CREATE TABLE `leave_approval_records` (
	`id` text PRIMARY KEY NOT NULL,
	`leave_request_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` text,
	`actor_name` text,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`comment` text,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text,
	FOREIGN KEY (`leave_request_id`) REFERENCES `leave_requests`(`id`) ON UPDATE no action ON DELETE no action
);
