import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { timeFields } from '$platform/modules/schema-helpers';
import { businessPartners } from '$modules/sales-crm/repositories/customer.schema';

export const partnerContacts = sqliteTable('partner_contacts', {
	id: text('id').primaryKey(),
	partnerId: text('partner_id')
		.notNull()
		.references(() => businessPartners.id),
	name: text('name').notNull(),
	phoneEmail: text('phone_email'),
	wechat: text('wechat'),
	position: text('position'),
	...timeFields
});

export const partnerSupplierProfiles = sqliteTable('partner_supplier_profiles', {
	id: text('id').primaryKey(),
	partnerId: text('partner_id')
		.notNull()
		.references(() => businessPartners.id),
	supplierType: text('supplier_type', {
		enum: ['individual', 'corporate_local', 'corporate_international']
	})
		.notNull()
		.default('corporate_local'),
	supplierStatus: text('supplier_status', {
		enum: ['approved', 'preferred', 'on_hold', 'blacklisted']
	})
		.notNull()
		.default('approved'),
	acraUen: text('acra_uen'),
	businessRegistrationNo: text('business_registration_no'),
	gstRegistrationStatus: text('gst_registration_status', {
		enum: ['registered', 'not_registered', 'exempt', 'unknown']
	})
		.notNull()
		.default('unknown'),
	taxCode: text('tax_code', { enum: ['SR', 'ZR', 'ES', 'OP'] }),
	billingAddress: text('billing_address'),
	shippingAddress: text('shipping_address'),
	bankName: text('bank_name'),
	bankAccountNo: text('bank_account_no'),
	swiftCode: text('swift_code'),
	creditTerms: text('credit_terms'),
	paymentTerms: text('payment_terms'),
	preferredCurrency: text('preferred_currency').default('SGD'),
	supplierCategory: text('supplier_category'),
	...timeFields
});

export const partnerSupplierComplianceRecords = sqliteTable('partner_supplier_compliance_records', {
	id: text('id').primaryKey(),
	partnerId: text('partner_id')
		.notNull()
		.references(() => businessPartners.id),
	recordType: text('record_type', {
		enum: ['licence', 'permit', 'insurance', 'certificate', 'other']
	}).notNull(),
	title: text('title').notNull(),
	issuer: text('issuer'),
	referenceNo: text('reference_no'),
	issueDate: text('issue_date'),
	expiryDate: text('expiry_date'),
	status: text('status', { enum: ['valid', 'expiring', 'expired', 'pending_review'] })
		.notNull()
		.default('pending_review'),
	notes: text('notes'),
	...timeFields
});

export const partnerSupplierAttachments = sqliteTable('partner_supplier_attachments', {
	id: text('id').primaryKey(),
	partnerId: text('partner_id')
		.notNull()
		.references(() => businessPartners.id),
	attachmentType: text('attachment_type', {
		enum: ['mou', 'nda', 'contract', 'certificate', 'licence', 'permit', 'insurance', 'other']
	}).notNull(),
	title: text('title').notNull(),
	fileName: text('file_name'),
	fileUrl: text('file_url'),
	expiryDate: text('expiry_date'),
	notes: text('notes'),
	...timeFields
});

export const partnerSupplierEvaluations = sqliteTable(
	'partner_supplier_evaluations',
	{
		id: text('id').primaryKey(),
		partnerId: text('partner_id')
			.notNull()
			.references(() => businessPartners.id),
		evaluationDate: text('evaluation_date').notNull(),
		evaluationCategory: text('evaluation_category'),
		evaluatorUserId: text('evaluator_user_id'),
		evaluatorEmail: text('evaluator_email'),
		defectRate: real('defect_rate').notNull().default(0),
		returnRate: real('return_rate').notNull().default(0),
		onTimeDeliveryPct: real('on_time_delivery_pct').notNull().default(0),
		leadTimeReliabilityScore: real('lead_time_reliability_score').notNull().default(0),
		priceCompetitivenessScore: real('price_competitiveness_score').notNull().default(0),
		paymentTermsScore: real('payment_terms_score').notNull().default(0),
		responsivenessScore: real('responsiveness_score').notNull().default(0),
		afterSalesSupportScore: real('after_sales_support_score').notNull().default(0),
		certificationScore: real('certification_score').notNull().default(0),
		creditCheckScore: real('credit_check_score').notNull().default(0),
		environmentalComplianceScore: real('environmental_compliance_score').notNull().default(0),
		qualityScore: real('quality_score').notNull().default(0),
		deliveryScore: real('delivery_score').notNull().default(0),
		priceScore: real('price_score').notNull().default(0),
		serviceScore: real('service_score').notNull().default(0),
		complianceScore: real('compliance_score').notNull().default(0),
		financialStabilityScore: real('financial_stability_score').notNull().default(0),
		sustainabilityScore: real('sustainability_score').notNull().default(0),
		qualityWeight: real('quality_weight').notNull().default(20),
		deliveryWeight: real('delivery_weight').notNull().default(20),
		priceWeight: real('price_weight').notNull().default(15),
		serviceWeight: real('service_weight').notNull().default(15),
		complianceWeight: real('compliance_weight').notNull().default(15),
		financialStabilityWeight: real('financial_stability_weight').notNull().default(10),
		sustainabilityWeight: real('sustainability_weight').notNull().default(5),
		goldThreshold: real('gold_threshold').notNull().default(85),
		silverThreshold: real('silver_threshold').notNull().default(70),
		bronzeThreshold: real('bronze_threshold').notNull().default(55),
		overallScore: real('overall_score').notNull().default(0),
		overallRating: text('overall_rating', {
			enum: ['gold', 'silver', 'bronze', 'not_approved']
		})
			.notNull()
			.default('not_approved'),
		notes: text('notes'),
		...timeFields
	},
	(table) => [
		index('idx_supplier_evaluation_partner_date').on(table.partnerId, table.evaluationDate),
		index('idx_supplier_evaluation_rating').on(table.overallRating)
	]
);
