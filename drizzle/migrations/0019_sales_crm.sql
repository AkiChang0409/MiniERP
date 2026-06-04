-- Sales & CRM — customer master expansion + quotations + sales orders.
-- Story 1: extend partner_customer_profiles (GST status, billing/shipping,
--   credit terms, credit hold) + customer contacts / communications /
--   attachments / price lists.
-- Story 2: sales quotations → sales orders with ATP reservation, partial
--   shipment / back-order, and the IA002 discount > 20% revenue-risk flag.

-- --- partner_customer_profiles: additive columns ---
ALTER TABLE `partner_customer_profiles` ADD `customer_status` text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE `partner_customer_profiles` ADD `gst_registration_status` text DEFAULT 'unknown' NOT NULL;
--> statement-breakpoint
ALTER TABLE `partner_customer_profiles` ADD `tax_code` text;
--> statement-breakpoint
ALTER TABLE `partner_customer_profiles` ADD `billing_address` text;
--> statement-breakpoint
ALTER TABLE `partner_customer_profiles` ADD `shipping_address` text;
--> statement-breakpoint
ALTER TABLE `partner_customer_profiles` ADD `credit_terms` text;
--> statement-breakpoint
ALTER TABLE `partner_customer_profiles` ADD `credit_hold_flag` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `partner_customer_profiles` ADD `credit_hold_reason` text;
--> statement-breakpoint
ALTER TABLE `partner_customer_profiles` ADD `preferred_currency` text DEFAULT 'SGD';
--> statement-breakpoint
CREATE TABLE `partner_customer_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`name` text NOT NULL,
	`phone_email` text,
	`position` text,
	`is_primary` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`partner_id`) REFERENCES `business_partners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_customer_contacts_partner` ON `partner_customer_contacts` (`partner_id`);
--> statement-breakpoint
CREATE TABLE `partner_customer_communications` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`channel` text DEFAULT 'note' NOT NULL,
	`subject` text NOT NULL,
	`body` text,
	`occurred_at` text NOT NULL,
	`contact_name` text,
	`logged_by_user_id` text,
	`logged_by_email` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`partner_id`) REFERENCES `business_partners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_customer_comms_partner` ON `partner_customer_communications` (`partner_id`,`occurred_at`);
--> statement-breakpoint
CREATE TABLE `partner_customer_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`attachment_type` text DEFAULT 'contract' NOT NULL,
	`title` text NOT NULL,
	`file_name` text,
	`file_url` text,
	`expiry_date` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`partner_id`) REFERENCES `business_partners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_customer_attachments_partner` ON `partner_customer_attachments` (`partner_id`);
--> statement-breakpoint
CREATE TABLE `customer_price_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text,
	`group_name` text,
	`name` text NOT NULL,
	`currency` text DEFAULT 'SGD' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`valid_from` text,
	`valid_to` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`partner_id`) REFERENCES `business_partners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_customer_price_lists_partner` ON `customer_price_lists` (`partner_id`);
--> statement-breakpoint
CREATE TABLE `customer_price_list_items` (
	`id` text PRIMARY KEY NOT NULL,
	`price_list_id` text NOT NULL,
	`item_id` text,
	`item_code` text,
	`description` text NOT NULL,
	`uom` text DEFAULT 'unit' NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`min_quantity` real DEFAULT 0 NOT NULL,
	`discount_pct` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`price_list_id`) REFERENCES `customer_price_lists`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_customer_price_list_items_list` ON `customer_price_list_items` (`price_list_id`);
--> statement-breakpoint
CREATE TABLE `sales_quotations` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_number` text NOT NULL,
	`customer_id` text NOT NULL,
	`project_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`currency` text DEFAULT 'SGD' NOT NULL,
	`quote_date` text NOT NULL,
	`valid_until` text,
	`tax_code` text,
	`subtotal_amount` real DEFAULT 0 NOT NULL,
	`discount_amount` real DEFAULT 0 NOT NULL,
	`discount_pct` real DEFAULT 0 NOT NULL,
	`tax_amount` real DEFAULT 0 NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL,
	`converted_order_id` text,
	`created_by_user_id` text,
	`created_by_email` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`customer_id`) REFERENCES `business_partners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_quotations_quote_number_unique` ON `sales_quotations` (`quote_number`);
--> statement-breakpoint
CREATE INDEX `idx_sales_quotations_customer` ON `sales_quotations` (`customer_id`);
--> statement-breakpoint
CREATE INDEX `idx_sales_quotations_status` ON `sales_quotations` (`status`);
--> statement-breakpoint
CREATE TABLE `sales_quotation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`quotation_id` text NOT NULL,
	`item_id` text,
	`item_code` text,
	`description` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`uom` text DEFAULT 'unit' NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`discount_pct` real DEFAULT 0 NOT NULL,
	`line_subtotal` real DEFAULT 0 NOT NULL,
	`tax_code` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`quotation_id`) REFERENCES `sales_quotations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sales_quotation_items_quote` ON `sales_quotation_items` (`quotation_id`);
--> statement-breakpoint
CREATE TABLE `sales_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`source_type` text DEFAULT 'manual' NOT NULL,
	`quotation_id` text,
	`customer_id` text NOT NULL,
	`project_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`approval_status` text DEFAULT 'not_required' NOT NULL,
	`order_date` text NOT NULL,
	`requested_delivery_date` text,
	`confirmed_delivery_date` text,
	`currency` text DEFAULT 'SGD' NOT NULL,
	`tax_code` text,
	`billing_address` text,
	`shipping_address` text,
	`subtotal_amount` real DEFAULT 0 NOT NULL,
	`discount_amount` real DEFAULT 0 NOT NULL,
	`discount_pct` real DEFAULT 0 NOT NULL,
	`shipping_amount` real DEFAULT 0 NOT NULL,
	`tax_amount` real DEFAULT 0 NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL,
	`credit_hold_flag` integer DEFAULT 0 NOT NULL,
	`credit_check_message` text,
	`ia_exception_code` text,
	`ia_exception_reason` text,
	`approved_by_user_id` text,
	`approved_by_email` text,
	`approved_at` text,
	`rejected_reason` text,
	`created_by_user_id` text,
	`created_by_email` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`quotation_id`) REFERENCES `sales_quotations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `business_partners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_orders_order_number_unique` ON `sales_orders` (`order_number`);
--> statement-breakpoint
CREATE INDEX `idx_sales_orders_customer` ON `sales_orders` (`customer_id`);
--> statement-breakpoint
CREATE INDEX `idx_sales_orders_status` ON `sales_orders` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_sales_orders_approval` ON `sales_orders` (`approval_status`);
--> statement-breakpoint
CREATE INDEX `idx_sales_orders_exception` ON `sales_orders` (`ia_exception_code`);
--> statement-breakpoint
CREATE TABLE `sales_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`item_id` text,
	`item_code` text,
	`description` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`uom` text DEFAULT 'unit' NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`discount_pct` real DEFAULT 0 NOT NULL,
	`line_subtotal` real DEFAULT 0 NOT NULL,
	`tax_code` text,
	`reserved_quantity` real DEFAULT 0 NOT NULL,
	`shipped_quantity` real DEFAULT 0 NOT NULL,
	`back_ordered_quantity` real DEFAULT 0 NOT NULL,
	`atp_at_confirm` real,
	`warehouse_id` text,
	`bin_location_id` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`order_id`) REFERENCES `sales_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bin_location_id`) REFERENCES `warehouse_bin_locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sales_order_items_order` ON `sales_order_items` (`order_id`);
--> statement-breakpoint
CREATE TABLE `sales_order_shipments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`order_item_id` text NOT NULL,
	`shipment_number` text,
	`shipment_date` text NOT NULL,
	`quantity_shipped` real DEFAULT 0 NOT NULL,
	`back_order_quantity` real DEFAULT 0 NOT NULL,
	`warehouse_id` text,
	`bin_location_id` text,
	`movement_id` text,
	`tracking_reference` text,
	`shipped_by_user_id` text,
	`shipped_by_email` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`order_id`) REFERENCES `sales_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_item_id`) REFERENCES `sales_order_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bin_location_id`) REFERENCES `warehouse_bin_locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sales_order_shipments_order` ON `sales_order_shipments` (`order_id`);
--> statement-breakpoint
CREATE INDEX `idx_sales_order_shipments_item` ON `sales_order_shipments` (`order_item_id`);
