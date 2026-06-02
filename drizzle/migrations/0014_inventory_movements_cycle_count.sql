-- INV003: Movement reasons + IA002 alert columns + cycle count tables.

-- 1. Extend movement schema: capture reason / SGD value / physical-count doc / IA alert.
ALTER TABLE `inventory_stock_movements` ADD COLUMN `reason_code` text;
--> statement-breakpoint
ALTER TABLE `inventory_stock_movements` ADD COLUMN `value_delta` real;
--> statement-breakpoint
ALTER TABLE `inventory_stock_movements` ADD COLUMN `physical_count_document_ref` text;
--> statement-breakpoint
ALTER TABLE `inventory_stock_movements` ADD COLUMN `ia_alert_code` text;
--> statement-breakpoint
CREATE INDEX `idx_inventory_stock_movements_alert` ON `inventory_stock_movements` (`ia_alert_code`);
--> statement-breakpoint

-- 2. Cycle count session header.
CREATE TABLE `inventory_cycle_counts` (
	`id` text PRIMARY KEY NOT NULL,
	`count_number` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`count_type` text DEFAULT 'cycle_count' NOT NULL,
	`scheduled_at` text,
	`counted_at` text,
	`posted_at` text,
	`performed_by_user_id` text,
	`performed_by_email` text,
	`approved_by_user_id` text,
	`approved_by_email` text,
	`document_ref` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inventory_cycle_counts_number_unique` ON `inventory_cycle_counts` (`count_number`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_cycle_counts_status` ON `inventory_cycle_counts` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_cycle_counts_warehouse` ON `inventory_cycle_counts` (`warehouse_id`);
--> statement-breakpoint

-- 3. Cycle count lines: planned vs counted vs variance.
CREATE TABLE `inventory_cycle_count_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_count_id` text NOT NULL,
	`item_id` text NOT NULL,
	`bin_location_id` text NOT NULL,
	`expected_quantity` real DEFAULT 0 NOT NULL,
	`counted_quantity` real,
	`variance` real,
	`unit_cost` real,
	`variance_value` real,
	`movement_id` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`cycle_count_id`) REFERENCES `inventory_cycle_counts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bin_location_id`) REFERENCES `warehouse_bin_locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_cycle_count_lines_count` ON `inventory_cycle_count_lines` (`cycle_count_id`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_cycle_count_lines_item` ON `inventory_cycle_count_lines` (`item_id`);
