-- TKMGMT1-10: Project Management module v1.
-- Adds owner / parent / deadline / notes / priority / attachment / recurrence
-- columns to `projects`, and introduces `project_collaborators` and
-- `project_comments` tables.

ALTER TABLE `projects` ADD COLUMN `owner_id` text REFERENCES `users`(`id`);
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `parent_project_id` text REFERENCES `projects`(`id`);
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `deadline` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `notes` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `priority` integer NOT NULL DEFAULT 5;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `attachment_url` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `attachment_name` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `recurrence_frequency` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `recurrence_interval` integer;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `recurrence_parent_id` text REFERENCES `projects`(`id`);
--> statement-breakpoint
CREATE INDEX `idx_projects_owner` ON `projects` (`owner_id`);
--> statement-breakpoint
CREATE INDEX `idx_projects_parent` ON `projects` (`parent_project_id`);
--> statement-breakpoint
CREATE INDEX `idx_projects_deadline` ON `projects` (`deadline`);
--> statement-breakpoint
CREATE INDEX `idx_projects_recurrence_parent` ON `projects` (`recurrence_parent_id`);
--> statement-breakpoint

CREATE TABLE `project_collaborators` (
    `id` text PRIMARY KEY NOT NULL,
    `project_id` text NOT NULL REFERENCES `projects`(`id`),
    `user_id` text NOT NULL REFERENCES `users`(`id`),
    `role` text,
    `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    `deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_project_collaborators_project` ON `project_collaborators` (`project_id`);
--> statement-breakpoint
CREATE INDEX `idx_project_collaborators_user` ON `project_collaborators` (`user_id`);
--> statement-breakpoint

CREATE TABLE `project_comments` (
    `id` text PRIMARY KEY NOT NULL,
    `project_id` text NOT NULL REFERENCES `projects`(`id`),
    `author_user_id` text REFERENCES `users`(`id`),
    `author_email` text,
    `author_name` text,
    `body` text NOT NULL,
    `mentions` text,
    `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    `deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_project_comments_project` ON `project_comments` (`project_id`, `created_at`);
