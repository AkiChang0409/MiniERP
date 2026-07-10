CREATE TABLE IF NOT EXISTS `lark_write_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`app_token` text NOT NULL,
	`table_id` text NOT NULL,
	`table_name` text DEFAULT '' NOT NULL,
	`record_id` text,
	`operation` text NOT NULL,
	`status` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`result` text DEFAULT '{}' NOT NULL,
	`error` text,
	`source_module` text DEFAULT '' NOT NULL,
	`source_action` text DEFAULT '' NOT NULL,
	`actor_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS `lark_write_operations_table_idx`
ON `lark_write_operations` (`table_id`);

CREATE INDEX IF NOT EXISTS `lark_write_operations_record_idx`
ON `lark_write_operations` (`record_id`);

CREATE INDEX IF NOT EXISTS `lark_write_operations_created_idx`
ON `lark_write_operations` (`created_at`);
