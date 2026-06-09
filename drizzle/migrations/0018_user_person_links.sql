-- CORE002: User ↔ HR person identity binding
-- Adds user_person_links table + invite_codes.linked_person_id column.
--
-- user_person_links: binds a login account (users) to an HR identity (persons).
--   Identity and permission (users.role) are orthogonal. MVP is one-to-one,
--   enforced by PARTIAL unique indexes scoped to `deleted_at IS NULL` so that
--   soft-deleting a link (unbind) frees both sides for a fresh bind — supports
--   frequent re-binding during development. `status` toggles a live link on/off
--   without unbinding. The resolver only honours active, non-deleted rows.
-- invite_codes.linked_person_id: the HR person an employee invite binds to.
--   When the code is consumed at registration, a user_person_links row is
--   created from this value. The personId never comes from the registrant.

CREATE TABLE `user_person_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`person_id` text NOT NULL,
	`status` text NOT NULL DEFAULT 'active',
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_person_links_user_active_uidx` ON `user_person_links` (`user_id`) WHERE `deleted_at` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `user_person_links_person_active_uidx` ON `user_person_links` (`person_id`) WHERE `deleted_at` IS NULL;
--> statement-breakpoint
ALTER TABLE `invite_codes` ADD `linked_person_id` text REFERENCES persons(id);
