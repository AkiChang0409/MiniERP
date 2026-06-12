-- Phase 1B + 2B + 3 scaffold: Gantt tasks, workflow stages, and per-user
-- calendar integration credentials. Tables only — UI code lights them up.

CREATE TABLE `project_tasks` (
    `id` text PRIMARY KEY NOT NULL,
    `project_id` text NOT NULL REFERENCES `projects`(`id`),
    `parent_task_id` text REFERENCES `project_tasks`(`id`),
    `name` text NOT NULL,
    `description` text,
    `status` text NOT NULL DEFAULT 'unassigned',
    `start_date` text,
    `end_date` text,
    `assignee_id` text REFERENCES `users`(`id`),
    `estimated_hours` integer,
    `order_index` integer NOT NULL DEFAULT 0,
    `completed_at` text,
    `is_milestone` integer NOT NULL DEFAULT 0,
    `workflow_stage_id` text,
    `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    `deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_project_tasks_project` ON `project_tasks` (`project_id`, `order_index`);
--> statement-breakpoint
CREATE INDEX `idx_project_tasks_parent` ON `project_tasks` (`parent_task_id`);
--> statement-breakpoint
CREATE INDEX `idx_project_tasks_assignee` ON `project_tasks` (`assignee_id`);
--> statement-breakpoint
CREATE INDEX `idx_project_tasks_stage` ON `project_tasks` (`workflow_stage_id`);
--> statement-breakpoint

CREATE TABLE `project_task_dependencies` (
    `id` text PRIMARY KEY NOT NULL,
    `project_id` text NOT NULL REFERENCES `projects`(`id`),
    `from_task_id` text NOT NULL REFERENCES `project_tasks`(`id`),
    `to_task_id` text NOT NULL REFERENCES `project_tasks`(`id`),
    `kind` text NOT NULL DEFAULT 'finish_to_start',
    `lag_days` integer NOT NULL DEFAULT 0,
    `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    `deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_task_deps_project` ON `project_task_dependencies` (`project_id`);
--> statement-breakpoint
CREATE INDEX `idx_task_deps_to` ON `project_task_dependencies` (`to_task_id`);
--> statement-breakpoint
CREATE INDEX `idx_task_deps_from` ON `project_task_dependencies` (`from_task_id`);
--> statement-breakpoint

CREATE TABLE `project_workflow_stages` (
    `id` text PRIMARY KEY NOT NULL,
    `project_id` text NOT NULL REFERENCES `projects`(`id`),
    `name` text NOT NULL,
    `order_index` integer NOT NULL DEFAULT 0,
    `kind` text NOT NULL DEFAULT 'task_group',
    `status` text NOT NULL DEFAULT 'pending',
    `condition_expression` text,
    `completed_at` text,
    `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    `deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_workflow_stages_project` ON `project_workflow_stages` (`project_id`, `order_index`);
--> statement-breakpoint

CREATE TABLE `project_calendar_integrations` (
    `id` text PRIMARY KEY NOT NULL,
    `user_id` text NOT NULL REFERENCES `users`(`id`),
    `provider` text NOT NULL,
    `external_account_email` text,
    `access_token_encrypted` text,
    `refresh_token_encrypted` text,
    `expires_at` text,
    `scope` text,
    `status` text NOT NULL DEFAULT 'active',
    `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    `deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_calendar_int_user` ON `project_calendar_integrations` (`user_id`, `provider`);
