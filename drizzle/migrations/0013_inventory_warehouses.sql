-- INV002: Warehouse + bin locations + stock levels + movements + transfers.

CREATE TABLE `warehouses` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`address_line1` text,
	`address_line2` text,
	`city` text,
	`state` text,
	`postal_code` text,
	`country` text DEFAULT 'Singapore' NOT NULL,
	`contact_name` text,
	`contact_phone` text,
	`contact_email` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_warehouses_code_unique` ON `warehouses` (`code`);
--> statement-breakpoint
CREATE INDEX `idx_warehouses_status` ON `warehouses` (`status`);
--> statement-breakpoint
CREATE TABLE `warehouse_bin_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`warehouse_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text,
	`location_type` text DEFAULT 'general' NOT NULL,
	`aisle` text,
	`rack` text,
	`shelf` text,
	`bin` text,
	`barcode` text,
	`is_pickable` integer DEFAULT true NOT NULL,
	`is_receivable` integer DEFAULT true NOT NULL,
	`is_default_putaway` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_warehouse_bins_wh_code_unique` ON `warehouse_bin_locations` (`warehouse_id`,`code`);
--> statement-breakpoint
CREATE INDEX `idx_warehouse_bins_warehouse` ON `warehouse_bin_locations` (`warehouse_id`);
--> statement-breakpoint
CREATE INDEX `idx_warehouse_bins_type` ON `warehouse_bin_locations` (`location_type`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_warehouse_bins_barcode_unique` ON `warehouse_bin_locations` (`barcode`);
--> statement-breakpoint
CREATE TABLE `inventory_stock_levels` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`bin_location_id` text NOT NULL,
	`quantity_on_hand` real DEFAULT 0 NOT NULL,
	`quantity_reserved` real DEFAULT 0 NOT NULL,
	`quantity_incoming` real DEFAULT 0 NOT NULL,
	`unit_cost` real,
	`last_movement_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bin_location_id`) REFERENCES `warehouse_bin_locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inventory_stock_levels_unique` ON `inventory_stock_levels` (`item_id`,`warehouse_id`,`bin_location_id`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_stock_levels_item` ON `inventory_stock_levels` (`item_id`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_stock_levels_bin` ON `inventory_stock_levels` (`bin_location_id`);
--> statement-breakpoint
CREATE TABLE `inventory_stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`bin_location_id` text NOT NULL,
	`movement_type` text NOT NULL,
	`quantity_delta` real NOT NULL,
	`quantity_after` real NOT NULL,
	`unit_cost` real,
	`reference_type` text,
	`reference_id` text,
	`performed_by_user_id` text,
	`performed_by_email` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bin_location_id`) REFERENCES `warehouse_bin_locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_stock_movements_item` ON `inventory_stock_movements` (`item_id`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_stock_movements_warehouse` ON `inventory_stock_movements` (`warehouse_id`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_stock_movements_bin` ON `inventory_stock_movements` (`bin_location_id`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_stock_movements_ref` ON `inventory_stock_movements` (`reference_type`,`reference_id`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_stock_movements_created` ON `inventory_stock_movements` (`created_at`);
--> statement-breakpoint
CREATE TABLE `inventory_stock_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`transfer_number` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`source_warehouse_id` text NOT NULL,
	`dest_warehouse_id` text NOT NULL,
	`requested_at` text,
	`shipped_at` text,
	`received_at` text,
	`performed_by_user_id` text,
	`performed_by_email` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`source_warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dest_warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inventory_stock_transfers_number_unique` ON `inventory_stock_transfers` (`transfer_number`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_stock_transfers_status` ON `inventory_stock_transfers` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_stock_transfers_source` ON `inventory_stock_transfers` (`source_warehouse_id`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_stock_transfers_dest` ON `inventory_stock_transfers` (`dest_warehouse_id`);
--> statement-breakpoint
CREATE TABLE `inventory_stock_transfer_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`transfer_id` text NOT NULL,
	`item_id` text NOT NULL,
	`source_bin_id` text NOT NULL,
	`dest_bin_id` text NOT NULL,
	`quantity_requested` real DEFAULT 0 NOT NULL,
	`quantity_shipped` real DEFAULT 0 NOT NULL,
	`quantity_received` real DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`transfer_id`) REFERENCES `inventory_stock_transfers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_bin_id`) REFERENCES `warehouse_bin_locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dest_bin_id`) REFERENCES `warehouse_bin_locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_stock_transfer_lines_transfer` ON `inventory_stock_transfer_lines` (`transfer_id`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_stock_transfer_lines_item` ON `inventory_stock_transfer_lines` (`item_id`);
