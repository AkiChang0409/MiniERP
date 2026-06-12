-- Lark Phase 3B: external_identity_links
-- Binds an external channel identity (Lark open_id) to a MiniERP user.
--   One ACTIVE binding per (provider, external_user_id), enforced by a PARTIAL
--   unique index scoped to `deleted_at IS NULL` (re-binding requires soft-delete
--   or repointing the existing row). A user may have multiple external links.
--   Identity (this link) and permission (users.role) stay orthogonal.

CREATE TABLE `external_identity_links` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`external_user_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL DEFAULT 'active',
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_identity_links_provider_external_active_uidx` ON `external_identity_links` (`provider`, `external_user_id`) WHERE `deleted_at` IS NULL;
