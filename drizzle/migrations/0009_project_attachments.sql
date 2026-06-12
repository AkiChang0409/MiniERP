-- TKMGMT1 v2: multi-file attachments for projects.
-- Adds a dedicated table so each file is its own row (own id, own delete,
-- own uploader). The legacy single-file columns on `projects`
-- (attachment_url / attachment_name) stay in place for back-compat reads.

CREATE TABLE `project_attachments` (
    `id` text PRIMARY KEY NOT NULL,
    `project_id` text NOT NULL REFERENCES `projects`(`id`),
    `storage_key` text NOT NULL,
    `url` text NOT NULL,
    `file_name` text NOT NULL,
    `content_type` text,
    `size_bytes` integer,
    `uploaded_by_id` text REFERENCES `users`(`id`),
    `uploaded_by_email` text,
    `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    `deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_project_attachments_project` ON `project_attachments` (`project_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_project_attachments_uploaded_by` ON `project_attachments` (`uploaded_by_id`);
