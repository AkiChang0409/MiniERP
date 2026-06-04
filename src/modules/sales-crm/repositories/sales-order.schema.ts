import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { timeFields } from '$platform/modules/schema-helpers';
import { businessPartners } from './customer.schema';
import { projects } from '$modules/project/repositories/project.schema';
import { items } from '$modules/inventory/repositories/item.schema';
import { warehouses, warehouseBinLocations } from '$modules/inventory/repositories/warehouse.schema';

export const salesQuotations = sqliteTable(
	'sales_quotations',
	{
		id: text('id').primaryKey(),
		quoteNumber: text('quote_number').notNull().unique(),
		customerId: text('customer_id')
			.notNull()
			.references(() => businessPartners.id),
		projectId: text('project_id').references(() => projects.id),
		status: text('status', {
			enum: ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted']
		})
			.notNull()
			.default('draft'),
		currency: text('currency').notNull().default('SGD'),
		quoteDate: text('quote_date').notNull(),
		validUntil: text('valid_until'),
		taxCode: text('tax_code', { enum: ['SR', 'ZR', 'ES', 'OP'] }),
		subtotalAmount: real('subtotal_amount').notNull().default(0),
		discountAmount: real('discount_amount').notNull().default(0),
		discountPct: real('discount_pct').notNull().default(0),
		taxAmount: real('tax_amount').notNull().default(0),
		totalAmount: real('total_amount').notNull().default(0),
		convertedOrderId: text('converted_order_id'),
		createdByUserId: text('created_by_user_id'),
		createdByEmail: text('created_by_email'),
		notes: text('notes'),
		...timeFields
	},
	(table) => [
		index('idx_sales_quotations_customer').on(table.customerId),
		index('idx_sales_quotations_status').on(table.status)
	]
);

export const salesQuotationItems = sqliteTable(
	'sales_quotation_items',
	{
		id: text('id').primaryKey(),
		quotationId: text('quotation_id')
			.notNull()
			.references(() => salesQuotations.id),
		itemId: text('item_id').references(() => items.id),
		itemCode: text('item_code'),
		description: text('description').notNull(),
		quantity: real('quantity').notNull().default(1),
		uom: text('uom').notNull().default('unit'),
		unitPrice: real('unit_price').notNull().default(0),
		discountPct: real('discount_pct').notNull().default(0),
		lineSubtotal: real('line_subtotal').notNull().default(0),
		taxCode: text('tax_code', { enum: ['SR', 'ZR', 'ES', 'OP'] }),
		notes: text('notes'),
		...timeFields
	},
	(table) => [index('idx_sales_quotation_items_quote').on(table.quotationId)]
);

export const salesOrders = sqliteTable(
	'sales_orders',
	{
		id: text('id').primaryKey(),
		orderNumber: text('order_number').notNull().unique(),
		sourceType: text('source_type', { enum: ['manual', 'quotation'] })
			.notNull()
			.default('manual'),
		quotationId: text('quotation_id').references(() => salesQuotations.id),
		customerId: text('customer_id')
			.notNull()
			.references(() => businessPartners.id),
		projectId: text('project_id').references(() => projects.id),
		// Fulfilment status machine: draft → confirmed → picking → packed → shipped → invoiced.
		status: text('status', {
			enum: ['draft', 'confirmed', 'picking', 'packed', 'shipped', 'invoiced', 'cancelled']
		})
			.notNull()
			.default('draft'),
		// Director approval is required when discount exceeds the IA002 threshold.
		approvalStatus: text('approval_status', {
			enum: ['not_required', 'pending_approval', 'approved', 'rejected']
		})
			.notNull()
			.default('not_required'),
		orderDate: text('order_date').notNull(),
		requestedDeliveryDate: text('requested_delivery_date'),
		confirmedDeliveryDate: text('confirmed_delivery_date'),
		currency: text('currency').notNull().default('SGD'),
		taxCode: text('tax_code', { enum: ['SR', 'ZR', 'ES', 'OP'] }),
		billingAddress: text('billing_address'),
		shippingAddress: text('shipping_address'),
		subtotalAmount: real('subtotal_amount').notNull().default(0),
		discountAmount: real('discount_amount').notNull().default(0),
		discountPct: real('discount_pct').notNull().default(0),
		shippingAmount: real('shipping_amount').notNull().default(0),
		taxAmount: real('tax_amount').notNull().default(0),
		totalAmount: real('total_amount').notNull().default(0),
		// Credit control — flag set when customer is on credit hold or this order
		// would push exposure over the credit limit.
		creditHoldFlag: integer('credit_hold_flag', { mode: 'boolean' }).notNull().default(false),
		creditCheckMessage: text('credit_check_message'),
		// IA002 — sales revenue risk: discount > 20% without director approval.
		iaExceptionCode: text('ia_exception_code'),
		iaExceptionReason: text('ia_exception_reason'),
		approvedByUserId: text('approved_by_user_id'),
		approvedByEmail: text('approved_by_email'),
		approvedAt: text('approved_at'),
		rejectedReason: text('rejected_reason'),
		createdByUserId: text('created_by_user_id'),
		createdByEmail: text('created_by_email'),
		notes: text('notes'),
		...timeFields
	},
	(table) => [
		index('idx_sales_orders_customer').on(table.customerId),
		index('idx_sales_orders_status').on(table.status),
		index('idx_sales_orders_approval').on(table.approvalStatus),
		index('idx_sales_orders_exception').on(table.iaExceptionCode)
	]
);

export const salesOrderItems = sqliteTable(
	'sales_order_items',
	{
		id: text('id').primaryKey(),
		orderId: text('order_id')
			.notNull()
			.references(() => salesOrders.id),
		itemId: text('item_id').references(() => items.id),
		itemCode: text('item_code'),
		description: text('description').notNull(),
		quantity: real('quantity').notNull().default(1),
		uom: text('uom').notNull().default('unit'),
		unitPrice: real('unit_price').notNull().default(0),
		discountPct: real('discount_pct').notNull().default(0),
		lineSubtotal: real('line_subtotal').notNull().default(0),
		taxCode: text('tax_code', { enum: ['SR', 'ZR', 'ES', 'OP'] }),
		// Fulfilment tracking — reserved against stock at confirm, decremented as shipped.
		reservedQuantity: real('reserved_quantity').notNull().default(0),
		shippedQuantity: real('shipped_quantity').notNull().default(0),
		backOrderedQuantity: real('back_ordered_quantity').notNull().default(0),
		// ATP snapshot captured at confirm time so we can explain reservation shortfalls.
		atpAtConfirm: real('atp_at_confirm'),
		// Inventory linkage so confirm/ship can reserve + draw down stock.
		warehouseId: text('warehouse_id').references(() => warehouses.id),
		binLocationId: text('bin_location_id').references(() => warehouseBinLocations.id),
		notes: text('notes'),
		...timeFields
	},
	(table) => [index('idx_sales_order_items_order').on(table.orderId)]
);

export const salesOrderShipments = sqliteTable(
	'sales_order_shipments',
	{
		id: text('id').primaryKey(),
		orderId: text('order_id')
			.notNull()
			.references(() => salesOrders.id),
		orderItemId: text('order_item_id')
			.notNull()
			.references(() => salesOrderItems.id),
		shipmentNumber: text('shipment_number'),
		shipmentDate: text('shipment_date').notNull(),
		quantityShipped: real('quantity_shipped').notNull().default(0),
		backOrderQuantity: real('back_order_quantity').notNull().default(0),
		warehouseId: text('warehouse_id').references(() => warehouses.id),
		binLocationId: text('bin_location_id').references(() => warehouseBinLocations.id),
		// Stock movement id written when the shipment draws down inventory.
		movementId: text('movement_id'),
		trackingReference: text('tracking_reference'),
		shippedByUserId: text('shipped_by_user_id'),
		shippedByEmail: text('shipped_by_email'),
		notes: text('notes'),
		...timeFields
	},
	(table) => [
		index('idx_sales_order_shipments_order').on(table.orderId),
		index('idx_sales_order_shipments_item').on(table.orderItemId)
	]
);
