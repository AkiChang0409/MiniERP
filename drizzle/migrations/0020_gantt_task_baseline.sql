-- Gantt optimization P0: task baseline/actual/kind/buffer + outsourcing links,
-- stage planned/actual window + colour, dependency hard/soft flag, and project
-- actual window + visibility. Columns only — service + UI light them up.

ALTER TABLE `project_tasks` ADD `kind` text DEFAULT 'task' NOT NULL;
--> statement-breakpoint
ALTER TABLE `project_tasks` ADD `baseline_start` text;
--> statement-breakpoint
ALTER TABLE `project_tasks` ADD `baseline_end` text;
--> statement-breakpoint
ALTER TABLE `project_tasks` ADD `actual_start` text;
--> statement-breakpoint
ALTER TABLE `project_tasks` ADD `progress_pct` integer;
--> statement-breakpoint
ALTER TABLE `project_tasks` ADD `buffer_days` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `project_tasks` ADD `blocked_reason` text;
--> statement-breakpoint
ALTER TABLE `project_tasks` ADD `outsourced_partner_id` text REFERENCES `business_partners`(`id`);
--> statement-breakpoint
ALTER TABLE `project_tasks` ADD `sub_project_id` text REFERENCES `projects`(`id`);
--> statement-breakpoint
ALTER TABLE `project_task_dependencies` ADD `is_blocking` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `project_workflow_stages` ADD `plan_start` text;
--> statement-breakpoint
ALTER TABLE `project_workflow_stages` ADD `plan_end` text;
--> statement-breakpoint
ALTER TABLE `project_workflow_stages` ADD `actual_start` text;
--> statement-breakpoint
ALTER TABLE `project_workflow_stages` ADD `actual_end` text;
--> statement-breakpoint
ALTER TABLE `project_workflow_stages` ADD `color` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD `actual_start` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD `actual_end` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD `visibility` text DEFAULT 'internal' NOT NULL;
