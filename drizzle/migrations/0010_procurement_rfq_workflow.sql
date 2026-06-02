CREATE TABLE `procurement_rfqs` (
	`id` text PRIMARY KEY NOT NULL,
	`rfq_number` text NOT NULL,
	`title` text NOT NULL,
	`source_type` text DEFAULT 'manual' NOT NULL,
	`source_id` text,
	`project_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`currency` text DEFAULT 'SGD' NOT NULL,
	`required_by_date` text,
	`created_by_user_id` text,
	`created_by_email` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `procurement_rfqs_rfq_number_unique` ON `procurement_rfqs` (`rfq_number`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_rfqs_status` ON `procurement_rfqs` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_rfqs_source` ON `procurement_rfqs` (`source_type`,`source_id`);
--> statement-breakpoint
CREATE TABLE `procurement_rfq_items` (
	`id` text PRIMARY KEY NOT NULL,
	`rfq_id` text NOT NULL,
	`item_code` text,
	`description` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`uom` text DEFAULT 'unit' NOT NULL,
	`target_unit_price` real,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`rfq_id`) REFERENCES `procurement_rfqs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_procurement_rfq_items_rfq` ON `procurement_rfq_items` (`rfq_id`);
--> statement-breakpoint
CREATE TABLE `procurement_rfq_suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`rfq_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`contact_name` text,
	`contact_email` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`sent_at` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`rfq_id`) REFERENCES `procurement_rfqs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `business_partners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_procurement_rfq_suppliers_rfq` ON `procurement_rfq_suppliers` (`rfq_id`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_rfq_suppliers_supplier` ON `procurement_rfq_suppliers` (`supplier_id`);
--> statement-breakpoint
CREATE TABLE `procurement_supplier_quotations` (
	`id` text PRIMARY KEY NOT NULL,
	`rfq_id` text NOT NULL,
	`rfq_supplier_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`quotation_number` text,
	`status` text DEFAULT 'submitted' NOT NULL,
	`submitted_at` text NOT NULL,
	`currency` text DEFAULT 'SGD' NOT NULL,
	`lead_time_days` real,
	`delivery_terms` text,
	`payment_terms` text,
	`validity_date` text,
	`shipping_amount` real DEFAULT 0 NOT NULL,
	`tax_amount` real DEFAULT 0 NOT NULL,
	`duties_amount` real DEFAULT 0 NOT NULL,
	`discount_amount` real DEFAULT 0 NOT NULL,
	`subtotal_amount` real DEFAULT 0 NOT NULL,
	`total_cost` real DEFAULT 0 NOT NULL,
	`supplier_rating_snapshot` real,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`rfq_id`) REFERENCES `procurement_rfqs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rfq_supplier_id`) REFERENCES `procurement_rfq_suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `business_partners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_procurement_supplier_quotes_rfq` ON `procurement_supplier_quotations` (`rfq_id`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_supplier_quotes_supplier` ON `procurement_supplier_quotations` (`supplier_id`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_supplier_quotes_status` ON `procurement_supplier_quotations` (`status`);
--> statement-breakpoint
CREATE TABLE `procurement_supplier_quotation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`quotation_id` text NOT NULL,
	`rfq_item_id` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`line_total` real DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`quotation_id`) REFERENCES `procurement_supplier_quotations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rfq_item_id`) REFERENCES `procurement_rfq_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_procurement_supplier_quote_items_quote` ON `procurement_supplier_quotation_items` (`quotation_id`);
--> statement-breakpoint
CREATE TABLE `procurement_purchase_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`po_number` text NOT NULL,
	`rfq_id` text,
	`quotation_id` text,
	`supplier_id` text,
	`project_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`po_date` text NOT NULL,
	`goods_receipt_date` text,
	`currency` text DEFAULT 'SGD' NOT NULL,
	`subtotal_amount` real DEFAULT 0 NOT NULL,
	`shipping_amount` real DEFAULT 0 NOT NULL,
	`tax_amount` real DEFAULT 0 NOT NULL,
	`duties_amount` real DEFAULT 0 NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL,
	`competitive_quotes_count` integer DEFAULT 0 NOT NULL,
	`after_the_fact_flag` integer DEFAULT false NOT NULL,
	`ia_exception_code` text,
	`ia_exception_reason` text,
	`created_by_user_id` text,
	`created_by_email` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`rfq_id`) REFERENCES `procurement_rfqs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quotation_id`) REFERENCES `procurement_supplier_quotations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `business_partners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `procurement_purchase_orders_po_number_unique` ON `procurement_purchase_orders` (`po_number`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_pos_rfq` ON `procurement_purchase_orders` (`rfq_id`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_pos_supplier` ON `procurement_purchase_orders` (`supplier_id`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_pos_exception` ON `procurement_purchase_orders` (`ia_exception_code`);
