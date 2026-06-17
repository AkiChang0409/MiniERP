-- ISO 9001 QMS: compliance document templates + filled records, plus the
-- `task_type` matching key on project_tasks. Columns/tables only — service +
-- UI light them up.

CREATE TABLE `qms_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`module_category` text,
	`scope` text DEFAULT 'task' NOT NULL,
	`task_type` text,
	`responsible_role` text,
	`field_schema` text,
	`file_template_url` text,
	`file_template_name` text,
	`requires_approval` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`description` text,
	`order_index` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_qms_templates_code` ON `qms_templates` (`code`);
--> statement-breakpoint
CREATE INDEX `idx_qms_templates_tasktype` ON `qms_templates` (`task_type`, `scope`);
--> statement-breakpoint
CREATE TABLE `qms_records` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL REFERENCES `qms_templates`(`id`),
	`project_id` text NOT NULL REFERENCES `projects`(`id`),
	`task_id` text REFERENCES `project_tasks`(`id`),
	`code` text,
	`name` text NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`responsible_user_id` text REFERENCES `users`(`id`),
	`responsible_role` text,
	`fields` text,
	`file_url` text,
	`storage_key` text,
	`file_name` text,
	`version` integer DEFAULT 1 NOT NULL,
	`is_required` integer DEFAULT true NOT NULL,
	`requires_approval` integer DEFAULT false NOT NULL,
	`submitted_at` text,
	`submitted_by_id` text REFERENCES `users`(`id`),
	`approved_at` text,
	`approved_by_id` text REFERENCES `users`(`id`),
	`rejected_reason` text,
	`waived_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_qms_records_task` ON `qms_records` (`task_id`);
--> statement-breakpoint
CREATE INDEX `idx_qms_records_project` ON `qms_records` (`project_id`, `status`);
--> statement-breakpoint
ALTER TABLE `project_tasks` ADD `task_type` text;
