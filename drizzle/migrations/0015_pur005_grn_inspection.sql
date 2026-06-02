-- PUR005 — Goods receipt notes, over/short receipt, inspection routing, payment trigger.
ALTER TABLE `items` ADD `inspection_required` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `items` ADD `over_receipt_tolerance_pct` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `partner_supplier_profiles` ADD `inspection_required` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_items` ADD `item_id` text REFERENCES `items`(`id`);
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_items` ADD `warehouse_id` text REFERENCES `warehouses`(`id`);
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_items` ADD `bin_location_id` text REFERENCES `warehouse_bin_locations`(`id`);
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_items` ADD `quarantine_bin_id` text REFERENCES `warehouse_bin_locations`(`id`);
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_items` ADD `inspection_required` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `status` text DEFAULT 'accepted' NOT NULL;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `inspection_required` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `inspection_status` text DEFAULT 'not_required' NOT NULL;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `inspection_decision_at` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `inspection_decision_by_user_id` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `inspection_decision_by_email` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `inspection_notes` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `rejection_reason` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `return_required` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `over_receipt_flag` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `item_id` text REFERENCES `items`(`id`);
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `warehouse_id` text REFERENCES `warehouses`(`id`);
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `bin_location_id` text REFERENCES `warehouse_bin_locations`(`id`);
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `quarantine_bin_id` text REFERENCES `warehouse_bin_locations`(`id`);
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `unit_cost` real;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `quarantine_movement_id` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `acceptance_movement_id` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `return_movement_id` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `payment_triggered_at` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `payment_reference` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `received_by_user_id` text;
--> statement-breakpoint
ALTER TABLE `procurement_purchase_order_receipts` ADD `received_by_email` text;
--> statement-breakpoint
CREATE INDEX `idx_procurement_po_receipts_status` ON `procurement_purchase_order_receipts` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_procurement_po_receipts_inspection` ON `procurement_purchase_order_receipts` (`inspection_status`);
