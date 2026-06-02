ALTER TABLE `procurement_purchase_orders` ADD `source_type` text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_orders` ADD `source_id` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_orders` ADD `approval_status` text DEFAULT 'pending_approval' NOT NULL;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_orders` ADD `approval_required` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_orders` ADD `approval_threshold_amount` real;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_orders` ADD `supplier_risk_level` text DEFAULT 'medium' NOT NULL;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_orders` ADD `approved_by_user_id` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_orders` ADD `approved_by_email` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_orders` ADD `approved_at` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_orders` ADD `rejected_reason` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_orders` ADD `delivery_date` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_orders` ADD `tax_code` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_orders` ADD `incoterms` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_orders` ADD `billing_address` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_orders` ADD `ack_status` text DEFAULT 'not_requested' NOT NULL;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_orders` ADD `ack_requested_at` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_orders` ADD `acknowledged_at` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_orders` ADD `supplier_ack_reference` text;
--> statement-breakpoint
CREATE INDEX `idx_procurement_pos_source` ON `procurement_purchase_orders` (`source_type`,`source_id`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_pos_approval` ON `procurement_purchase_orders` (`approval_status`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_pos_ack` ON `procurement_purchase_orders` (`ack_status`);
--> statement-breakpoint
CREATE TABLE `procurement_purchase_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`po_id` text NOT NULL,
	`item_code` text,
	`description` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`received_quantity` real DEFAULT 0 NOT NULL,
	`back_ordered_quantity` real DEFAULT 0 NOT NULL,
	`uom` text DEFAULT 'unit' NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`line_subtotal` real DEFAULT 0 NOT NULL,
	`tax_code` text,
	`delivery_date` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`po_id`) REFERENCES `procurement_purchase_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_procurement_po_items_po` ON `procurement_purchase_order_items` (`po_id`);
--> statement-breakpoint
CREATE TABLE `procurement_purchase_order_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`po_id` text NOT NULL,
	`po_item_id` text NOT NULL,
	`receipt_number` text,
	`receipt_date` text NOT NULL,
	`quantity_received` real DEFAULT 0 NOT NULL,
	`accepted_quantity` real DEFAULT 0 NOT NULL,
	`rejected_quantity` real DEFAULT 0 NOT NULL,
	`back_order_quantity` real DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`po_id`) REFERENCES `procurement_purchase_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`po_item_id`) REFERENCES `procurement_purchase_order_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_procurement_po_receipts_po` ON `procurement_purchase_order_receipts` (`po_id`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_po_receipts_item` ON `procurement_purchase_order_receipts` (`po_item_id`);
