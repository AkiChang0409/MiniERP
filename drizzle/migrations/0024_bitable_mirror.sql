-- Bitable-as-source-of-truth: generic raw mirror of Lark Bitable records.
-- All synced records (every table) land here as JSON; typed bt_* projections
-- derive from this. PK = `${tableId}:${recordId}`; soft-delete via `deleted`
-- with a `synced_at` watermark (rows not touched by the latest table run are
-- marked deleted).

CREATE TABLE `bitable_records` (
	`id` text PRIMARY KEY NOT NULL,
	`base_token` text NOT NULL,
	`table_id` text NOT NULL,
	`table_name` text NOT NULL DEFAULT '',
	`record_id` text NOT NULL,
	`fields` text NOT NULL DEFAULT '{}',
	`lark_created_time` integer,
	`lark_last_modified` integer,
	`synced_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX `bitable_records_table_idx` ON `bitable_records` (`table_id`);
