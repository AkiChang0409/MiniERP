-- Gantt optimization P3: task schedule-change audit log + in-app notifications.

CREATE TABLE `project_task_schedule_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL REFERENCES `projects`(`id`),
	`task_id` text NOT NULL REFERENCES `project_tasks`(`id`),
	`event_type` text NOT NULL,
	`old_start` text,
	`old_end` text,
	`new_start` text,
	`new_end` text,
	`reason` text,
	`triggered_by` text REFERENCES `users`(`id`),
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_task_schedule_changes_task` ON `project_task_schedule_changes` (`task_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_task_schedule_changes_project` ON `project_task_schedule_changes` (`project_id`);
--> statement-breakpoint
CREATE TABLE `project_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL REFERENCES `users`(`id`),
	`project_id` text REFERENCES `projects`(`id`),
	`task_id` text REFERENCES `project_tasks`(`id`),
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`dedupe_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_project_notifications_recipient` ON `project_notifications` (`recipient_id`, `is_read`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_project_notifications_dedupe` ON `project_notifications` (`recipient_id`, `dedupe_key`);
