-- INV001: Inventory item master data
-- Adds items table plus item attachments and item barcodes tables.

CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`item_type` text DEFAULT 'raw_material' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`category` text,
	`uom` text DEFAULT 'unit' NOT NULL,
	`uom_category` text,
	`preferred_supplier_id` text,
	`reorder_point` real,
	`min_level` real,
	`max_level` real,
	`lead_time_days` integer,
	`lot_control` integer DEFAULT false NOT NULL,
	`serial_control` integer DEFAULT false NOT NULL,
	`shelf_life_days` integer,
	`valuation_method` text DEFAULT 'weighted_average' NOT NULL,
	`standard_cost` real,
	`last_cost` real,
	`average_cost` real,
	`currency` text DEFAULT 'SGD' NOT NULL,
	`primary_image_url` text,
	`primary_barcode_value` text,
	`primary_barcode_type` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`preferred_supplier_id`) REFERENCES `business_partners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_items_code_unique` ON `items` (`code`);
--> statement-breakpoint
CREATE INDEX `idx_items_type` ON `items` (`item_type`);
--> statement-breakpoint
CREATE INDEX `idx_items_status` ON `items` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_items_category` ON `items` (`category`);
--> statement-breakpoint
CREATE INDEX `idx_items_supplier` ON `items` (`preferred_supplier_id`);
--> statement-breakpoint
CREATE TABLE `inventory_item_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`attachment_type` text DEFAULT 'other' NOT NULL,
	`title` text NOT NULL,
	`file_name` text,
	`file_url` text,
	`mime_type` text,
	`is_primary_image` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_item_attachments_item` ON `inventory_item_attachments` (`item_id`);
--> statement-breakpoint
CREATE TABLE `inventory_item_barcodes` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`barcode_value` text NOT NULL,
	`barcode_type` text DEFAULT 'code128' NOT NULL,
	`packaging_level` text DEFAULT 'each' NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inventory_item_barcodes_value_unique` ON `inventory_item_barcodes` (`barcode_value`);
--> statement-breakpoint
CREATE INDEX `idx_inventory_item_barcodes_item` ON `inventory_item_barcodes` (`item_id`);
