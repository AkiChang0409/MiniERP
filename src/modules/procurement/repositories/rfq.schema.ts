import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { timeFields } from '$platform/modules/schema-helpers';
import { businessPartners } from '$modules/sales-crm/repositories/customer.schema';
import { projects } from '$modules/project/repositories/project.schema';

export const procurementRfqs = sqliteTable(
	'procurement_rfqs',
	{
		id: text('id').primaryKey(),
		rfqNumber: text('rfq_number').notNull().unique(),
		title: text('title').notNull(),
		sourceType: text('source_type', {
			enum: ['purchase_requisition', 'mrp_suggestion', 'manual']
		})
			.notNull()
			.default('manual'),
		sourceId: text('source_id'),
		projectId: text('project_id').references(() => projects.id),
		status: text('status', {
			enum: ['draft', 'sent', 'closed', 'cancelled', 'converted']
		})
			.notNull()
			.default('draft'),
		currency: text('currency').notNull().default('SGD'),
		requiredByDate: text('required_by_date'),
		createdByUserId: text('created_by_user_id'),
		createdByEmail: text('created_by_email'),
		notes: text('notes'),
		...timeFields
	},
	(table) => [
		index('idx_procurement_rfqs_status').on(table.status),
		index('idx_procurement_rfqs_source').on(table.sourceType, table.sourceId)
	]
);

export const procurementRfqItems = sqliteTable(
	'procurement_rfq_items',
	{
		id: text('id').primaryKey(),
		rfqId: text('rfq_id')
			.notNull()
			.references(() => procurementRfqs.id),
		itemCode: text('item_code'),
		description: text('description').notNull(),
		quantity: real('quantity').notNull().default(1),
		uom: text('uom').notNull().default('unit'),
		targetUnitPrice: real('target_unit_price'),
		notes: text('notes'),
		...timeFields
	},
	(table) => [index('idx_procurement_rfq_items_rfq').on(table.rfqId)]
);

export const procurementRfqSuppliers = sqliteTable(
	'procurement_rfq_suppliers',
	{
		id: text('id').primaryKey(),
		rfqId: text('rfq_id')
			.notNull()
			.references(() => procurementRfqs.id),
		supplierId: text('supplier_id')
			.notNull()
			.references(() => businessPartners.id),
		contactName: text('contact_name'),
		contactEmail: text('contact_email'),
		status: text('status', {
			enum: ['draft', 'sent', 'responded', 'declined', 'no_response']
		})
			.notNull()
			.default('draft'),
		sentAt: text('sent_at'),
		notes: text('notes'),
		...timeFields
	},
	(table) => [
		index('idx_procurement_rfq_suppliers_rfq').on(table.rfqId),
		index('idx_procurement_rfq_suppliers_supplier').on(table.supplierId)
	]
);

export const procurementSupplierQuotations = sqliteTable(
	'procurement_supplier_quotations',
	{
		id: text('id').primaryKey(),
		rfqId: text('rfq_id')
			.notNull()
			.references(() => procurementRfqs.id),
		rfqSupplierId: text('rfq_supplier_id')
			.notNull()
			.references(() => procurementRfqSuppliers.id),
		supplierId: text('supplier_id')
			.notNull()
			.references(() => businessPartners.id),
		quotationNumber: text('quotation_number'),
		status: text('status', {
			enum: ['submitted', 'selected', 'rejected', 'expired']
		})
			.notNull()
			.default('submitted'),
		submittedAt: text('submitted_at').notNull(),
		currency: text('currency').notNull().default('SGD'),
		leadTimeDays: real('lead_time_days'),
		deliveryTerms: text('delivery_terms'),
		paymentTerms: text('payment_terms'),
		validityDate: text('validity_date'),
		shippingAmount: real('shipping_amount').notNull().default(0),
		taxAmount: real('tax_amount').notNull().default(0),
		dutiesAmount: real('duties_amount').notNull().default(0),
		discountAmount: real('discount_amount').notNull().default(0),
		subtotalAmount: real('subtotal_amount').notNull().default(0),
		totalCost: real('total_cost').notNull().default(0),
		supplierRatingSnapshot: real('supplier_rating_snapshot'),
		notes: text('notes'),
		...timeFields
	},
	(table) => [
		index('idx_procurement_supplier_quotes_rfq').on(table.rfqId),
		index('idx_procurement_supplier_quotes_supplier').on(table.supplierId),
		index('idx_procurement_supplier_quotes_status').on(table.status)
	]
);

export const procurementSupplierQuotationItems = sqliteTable(
	'procurement_supplier_quotation_items',
	{
		id: text('id').primaryKey(),
		quotationId: text('quotation_id')
			.notNull()
			.references(() => procurementSupplierQuotations.id),
		rfqItemId: text('rfq_item_id')
			.notNull()
			.references(() => procurementRfqItems.id),
		quantity: real('quantity').notNull().default(1),
		unitPrice: real('unit_price').notNull().default(0),
		lineTotal: real('line_total').notNull().default(0),
		notes: text('notes'),
		...timeFields
	},
	(table) => [index('idx_procurement_supplier_quote_items_quote').on(table.quotationId)]
);

export const procurementPurchaseOrders = sqliteTable(
	'procurement_purchase_orders',
	{
		id: text('id').primaryKey(),
		poNumber: text('po_number').notNull().unique(),
		sourceType: text('source_type', {
			enum: ['purchase_requisition', 'rfq', 'mrp_suggestion', 'manual']
		})
			.notNull()
			.default('manual'),
		sourceId: text('source_id'),
		rfqId: text('rfq_id').references(() => procurementRfqs.id),
		quotationId: text('quotation_id').references(() => procurementSupplierQuotations.id),
		supplierId: text('supplier_id').references(() => businessPartners.id),
		projectId: text('project_id').references(() => projects.id),
		status: text('status', {
			enum: [
				'draft',
				'pending_approval',
				'approved',
				'sent',
				'confirmed',
				'partially_received',
				'back_ordered',
				'received',
				'cancelled'
			]
		})
			.notNull()
			.default('draft'),
		approvalStatus: text('approval_status', {
			enum: ['not_required', 'pending_approval', 'approved', 'rejected']
		})
			.notNull()
			.default('pending_approval'),
		approvalRequired: integer('approval_required', { mode: 'boolean' }).notNull().default(true),
		approvalThresholdAmount: real('approval_threshold_amount'),
		supplierRiskLevel: text('supplier_risk_level', { enum: ['low', 'medium', 'high'] })
			.notNull()
			.default('medium'),
		approvedByUserId: text('approved_by_user_id'),
		approvedByEmail: text('approved_by_email'),
		approvedAt: text('approved_at'),
		rejectedReason: text('rejected_reason'),
		poDate: text('po_date').notNull(),
		deliveryDate: text('delivery_date'),
		goodsReceiptDate: text('goods_receipt_date'),
		currency: text('currency').notNull().default('SGD'),
		taxCode: text('tax_code', { enum: ['SR', 'ZR', 'ES', 'OP'] }),
		incoterms: text('incoterms'),
		billingAddress: text('billing_address'),
		ackStatus: text('ack_status', {
			enum: ['not_requested', 'requested', 'acknowledged', 'rejected', 'overdue']
		})
			.notNull()
			.default('not_requested'),
		ackRequestedAt: text('ack_requested_at'),
		acknowledgedAt: text('acknowledged_at'),
		supplierAckReference: text('supplier_ack_reference'),
		subtotalAmount: real('subtotal_amount').notNull().default(0),
		shippingAmount: real('shipping_amount').notNull().default(0),
		taxAmount: real('tax_amount').notNull().default(0),
		dutiesAmount: real('duties_amount').notNull().default(0),
		totalAmount: real('total_amount').notNull().default(0),
		competitiveQuotesCount: integer('competitive_quotes_count').notNull().default(0),
		afterTheFactFlag: integer('after_the_fact_flag', { mode: 'boolean' }).notNull().default(false),
		iaExceptionCode: text('ia_exception_code'),
		iaExceptionReason: text('ia_exception_reason'),
		createdByUserId: text('created_by_user_id'),
		createdByEmail: text('created_by_email'),
		notes: text('notes'),
		...timeFields
	},
	(table) => [
		index('idx_procurement_pos_rfq').on(table.rfqId),
		index('idx_procurement_pos_supplier').on(table.supplierId),
		index('idx_procurement_pos_source').on(table.sourceType, table.sourceId),
		index('idx_procurement_pos_approval').on(table.approvalStatus),
		index('idx_procurement_pos_ack').on(table.ackStatus),
		index('idx_procurement_pos_exception').on(table.iaExceptionCode)
	]
);

export const procurementPurchaseOrderItems = sqliteTable(
	'procurement_purchase_order_items',
	{
		id: text('id').primaryKey(),
		poId: text('po_id')
			.notNull()
			.references(() => procurementPurchaseOrders.id),
		itemCode: text('item_code'),
		description: text('description').notNull(),
		quantity: real('quantity').notNull().default(1),
		receivedQuantity: real('received_quantity').notNull().default(0),
		backOrderedQuantity: real('back_ordered_quantity').notNull().default(0),
		uom: text('uom').notNull().default('unit'),
		unitPrice: real('unit_price').notNull().default(0),
		lineSubtotal: real('line_subtotal').notNull().default(0),
		taxCode: text('tax_code', { enum: ['SR', 'ZR', 'ES', 'OP'] }),
		deliveryDate: text('delivery_date'),
		notes: text('notes'),
		...timeFields
	},
	(table) => [index('idx_procurement_po_items_po').on(table.poId)]
);

export const procurementPurchaseOrderReceipts = sqliteTable(
	'procurement_purchase_order_receipts',
	{
		id: text('id').primaryKey(),
		poId: text('po_id')
			.notNull()
			.references(() => procurementPurchaseOrders.id),
		poItemId: text('po_item_id')
			.notNull()
			.references(() => procurementPurchaseOrderItems.id),
		receiptNumber: text('receipt_number'),
		receiptDate: text('receipt_date').notNull(),
		quantityReceived: real('quantity_received').notNull().default(0),
		acceptedQuantity: real('accepted_quantity').notNull().default(0),
		rejectedQuantity: real('rejected_quantity').notNull().default(0),
		backOrderQuantity: real('back_order_quantity').notNull().default(0),
		notes: text('notes'),
		...timeFields
	},
	(table) => [
		index('idx_procurement_po_receipts_po').on(table.poId),
		index('idx_procurement_po_receipts_item').on(table.poItemId)
	]
);
