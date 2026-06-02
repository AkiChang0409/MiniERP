-- PUR002: Supplier scorecards and evaluation history.
-- Stores the ISO 9001-aligned metrics, weight snapshot, threshold snapshot, and rating per evaluation.

CREATE TABLE `partner_supplier_evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`evaluation_date` text NOT NULL,
	`evaluation_category` text,
	`evaluator_user_id` text,
	`evaluator_email` text,
	`defect_rate` real DEFAULT 0 NOT NULL,
	`return_rate` real DEFAULT 0 NOT NULL,
	`on_time_delivery_pct` real DEFAULT 0 NOT NULL,
	`lead_time_reliability_score` real DEFAULT 0 NOT NULL,
	`price_competitiveness_score` real DEFAULT 0 NOT NULL,
	`payment_terms_score` real DEFAULT 0 NOT NULL,
	`responsiveness_score` real DEFAULT 0 NOT NULL,
	`after_sales_support_score` real DEFAULT 0 NOT NULL,
	`certification_score` real DEFAULT 0 NOT NULL,
	`credit_check_score` real DEFAULT 0 NOT NULL,
	`environmental_compliance_score` real DEFAULT 0 NOT NULL,
	`quality_score` real DEFAULT 0 NOT NULL,
	`delivery_score` real DEFAULT 0 NOT NULL,
	`price_score` real DEFAULT 0 NOT NULL,
	`service_score` real DEFAULT 0 NOT NULL,
	`compliance_score` real DEFAULT 0 NOT NULL,
	`financial_stability_score` real DEFAULT 0 NOT NULL,
	`sustainability_score` real DEFAULT 0 NOT NULL,
	`quality_weight` real DEFAULT 20 NOT NULL,
	`delivery_weight` real DEFAULT 20 NOT NULL,
	`price_weight` real DEFAULT 15 NOT NULL,
	`service_weight` real DEFAULT 15 NOT NULL,
	`compliance_weight` real DEFAULT 15 NOT NULL,
	`financial_stability_weight` real DEFAULT 10 NOT NULL,
	`sustainability_weight` real DEFAULT 5 NOT NULL,
	`gold_threshold` real DEFAULT 85 NOT NULL,
	`silver_threshold` real DEFAULT 70 NOT NULL,
	`bronze_threshold` real DEFAULT 55 NOT NULL,
	`overall_score` real DEFAULT 0 NOT NULL,
	`overall_rating` text DEFAULT 'not_approved' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`partner_id`) REFERENCES `business_partners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_supplier_evaluation_partner_date` ON `partner_supplier_evaluations` (`partner_id`,`evaluation_date`);
--> statement-breakpoint
CREATE INDEX `idx_supplier_evaluation_rating` ON `partner_supplier_evaluations` (`overall_rating`);
