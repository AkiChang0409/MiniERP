-- PUR001: Supplier pre-qualification master data
-- Extends supplier profiles and adds compliance / attachment metadata tables.

ALTER TABLE `partner_supplier_profiles` ADD COLUMN `supplier_type` text NOT NULL DEFAULT 'corporate_local';
--> statement-breakpoint
ALTER TABLE `partner_supplier_profiles` ADD COLUMN `supplier_status` text NOT NULL DEFAULT 'approved';
--> statement-breakpoint
ALTER TABLE `partner_supplier_profiles` ADD COLUMN `acra_uen` text;
--> statement-breakpoint
ALTER TABLE `partner_supplier_profiles` ADD COLUMN `business_registration_no` text;
--> statement-breakpoint
ALTER TABLE `partner_supplier_profiles` ADD COLUMN `gst_registration_status` text NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
ALTER TABLE `partner_supplier_profiles` ADD COLUMN `tax_code` text;
--> statement-breakpoint
ALTER TABLE `partner_supplier_profiles` ADD COLUMN `billing_address` text;
--> statement-breakpoint
ALTER TABLE `partner_supplier_profiles` ADD COLUMN `shipping_address` text;
--> statement-breakpoint
ALTER TABLE `partner_supplier_profiles` ADD COLUMN `bank_name` text;
--> statement-breakpoint
ALTER TABLE `partner_supplier_profiles` ADD COLUMN `bank_account_no` text;
--> statement-breakpoint
ALTER TABLE `partner_supplier_profiles` ADD COLUMN `swift_code` text;
--> statement-breakpoint
ALTER TABLE `partner_supplier_profiles` ADD COLUMN `credit_terms` text;
--> statement-breakpoint
CREATE TABLE `partner_supplier_compliance_records` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`record_type` text NOT NULL,
	`title` text NOT NULL,
	`issuer` text,
	`reference_no` text,
	`issue_date` text,
	`expiry_date` text,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`partner_id`) REFERENCES `business_partners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `partner_supplier_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`attachment_type` text NOT NULL,
	`title` text NOT NULL,
	`file_name` text,
	`file_url` text,
	`expiry_date` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`partner_id`) REFERENCES `business_partners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_supplier_compliance_partner` ON `partner_supplier_compliance_records` (`partner_id`);
--> statement-breakpoint
CREATE INDEX `idx_supplier_compliance_expiry` ON `partner_supplier_compliance_records` (`expiry_date`);
--> statement-breakpoint
CREATE INDEX `idx_supplier_attachment_partner` ON `partner_supplier_attachments` (`partner_id`);
