-- PUR006 — Supplier invoice + 3-way matching (Invoice vs PO vs GRN).
-- IA004 audit alert is raised on the invoice header when any line has price
-- variance > 5% vs the matched PO line.

CREATE TABLE `procurement_supplier_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_number` text NOT NULL,
	`invoice_reference` text NOT NULL,
	`supplier_id` text,
	`po_id` text,
	`project_id` text,
	`invoice_date` text NOT NULL,
	`received_date` text,
	`due_date` text,
	`currency` text DEFAULT 'SGD' NOT NULL,
	`subtotal_amount` real DEFAULT 0 NOT NULL,
	`shipping_amount` real DEFAULT 0 NOT NULL,
	`tax_amount` real DEFAULT 0 NOT NULL,
	`duties_amount` real DEFAULT 0 NOT NULL,
	`discount_amount` real DEFAULT 0 NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL,
	`match_status` text DEFAULT 'unmatched' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`approval_status` text DEFAULT 'pending_review' NOT NULL,
	`approved_by_user_id` text,
	`approved_by_email` text,
	`approved_at` text,
	`rejection_reason` text,
	`ia_exception_code` text,
	`ia_exception_reason` text,
	`max_price_variance_pct` real,
	`payment_reference` text,
	`payment_triggered_at` text,
	`created_by_user_id` text,
	`created_by_email` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `business_partners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`po_id`) REFERENCES `procurement_purchase_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `procurement_supplier_invoices_invoice_reference_unique` ON `procurement_supplier_invoices` (`invoice_reference`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_supplier_invoices_supplier` ON `procurement_supplier_invoices` (`supplier_id`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_supplier_invoices_po` ON `procurement_supplier_invoices` (`po_id`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_supplier_invoices_status` ON `procurement_supplier_invoices` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_supplier_invoices_match` ON `procurement_supplier_invoices` (`match_status`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_supplier_invoices_approval` ON `procurement_supplier_invoices` (`approval_status`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_supplier_invoices_exception` ON `procurement_supplier_invoices` (`ia_exception_code`);
--> statement-breakpoint
CREATE TABLE `procurement_supplier_invoice_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`po_item_id` text,
	`receipt_id` text,
	`description` text NOT NULL,
	`item_code` text,
	`quantity_invoiced` real DEFAULT 0 NOT NULL,
	`unit_price_invoiced` real DEFAULT 0 NOT NULL,
	`line_subtotal` real DEFAULT 0 NOT NULL,
	`tax_code` text,
	`po_unit_price` real,
	`po_quantity_ordered` real,
	`quantity_received_matched` real DEFAULT 0 NOT NULL,
	`quantity_previously_invoiced` real DEFAULT 0 NOT NULL,
	`price_variance_pct` real,
	`qty_variance` real,
	`line_match_status` text DEFAULT 'unmatched' NOT NULL,
	`ia_exception_code` text,
	`approval_override` integer DEFAULT 0 NOT NULL,
	`approval_override_reason` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`invoice_id`) REFERENCES `procurement_supplier_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`po_item_id`) REFERENCES `procurement_purchase_order_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receipt_id`) REFERENCES `procurement_purchase_order_receipts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_procurement_invoice_lines_invoice` ON `procurement_supplier_invoice_lines` (`invoice_id`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_invoice_lines_po_item` ON `procurement_supplier_invoice_lines` (`po_item_id`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_invoice_lines_match` ON `procurement_supplier_invoice_lines` (`line_match_status`);
