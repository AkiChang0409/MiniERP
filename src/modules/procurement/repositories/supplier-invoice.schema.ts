import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { timeFields } from '$platform/modules/schema-helpers';
import { businessPartners } from '$modules/sales-crm/repositories/customer.schema';
import { projects } from '$modules/project/repositories/project.schema';
import {
	procurementPurchaseOrders,
	procurementPurchaseOrderItems,
	procurementPurchaseOrderReceipts
} from './rfq.schema';

// PUR006 — Supplier invoice header. One invoice per supplier document; a
// single invoice usually maps to one PO but lines individually FK the PO item
// so multi-PO invoices can be modelled later without schema changes.
export const procurementSupplierInvoices = sqliteTable(
	'procurement_supplier_invoices',
	{
		id: text('id').primaryKey(),
		// Number assigned by the supplier (printed on their invoice). Internal
		// system number is `invoiceReference` (`SI-...`) so we can avoid clashes
		// between suppliers that reuse simple sequences.
		invoiceNumber: text('invoice_number').notNull(),
		invoiceReference: text('invoice_reference').notNull().unique(),
		supplierId: text('supplier_id').references(() => businessPartners.id),
		poId: text('po_id').references(() => procurementPurchaseOrders.id),
		projectId: text('project_id').references(() => projects.id),
		invoiceDate: text('invoice_date').notNull(),
		receivedDate: text('received_date'),
		dueDate: text('due_date'),
		currency: text('currency').notNull().default('SGD'),
		// Captured from the supplier document — we do NOT recompute these from
		// the lines so the user can see exactly what was typed against the
		// extracted/recomputed values.
		subtotalAmount: real('subtotal_amount').notNull().default(0),
		shippingAmount: real('shipping_amount').notNull().default(0),
		taxAmount: real('tax_amount').notNull().default(0),
		dutiesAmount: real('duties_amount').notNull().default(0),
		discountAmount: real('discount_amount').notNull().default(0),
		totalAmount: real('total_amount').notNull().default(0),
		// 3-way matching outcome. `matched` means every line tied to PO + GRN
		// within tolerance; the other values mark which check failed worst.
		matchStatus: text('match_status', {
			enum: [
				'unmatched',
				'matched',
				'qty_mismatch',
				'price_variance',
				'missing_grn',
				'no_po'
			]
		})
			.notNull()
			.default('unmatched'),
		// Workflow status combines match + reviewer decisions.
		status: text('status', {
			enum: [
				'draft',
				'pending_match',
				'matched',
				'partial_match',
				'disputed',
				'approved',
				'rejected',
				'paid',
				'cancelled'
			]
		})
			.notNull()
			.default('draft'),
		approvalStatus: text('approval_status', {
			enum: ['pending_review', 'auto_approved', 'approved', 'rejected']
		})
			.notNull()
			.default('pending_review'),
		approvedByUserId: text('approved_by_user_id'),
		approvedByEmail: text('approved_by_email'),
		approvedAt: text('approved_at'),
		rejectionReason: text('rejection_reason'),
		// IA004 — written when any line has price variance > 5% so the audit
		// surface can filter without rerunning the matcher.
		iaExceptionCode: text('ia_exception_code'),
		iaExceptionReason: text('ia_exception_reason'),
		maxPriceVariancePct: real('max_price_variance_pct'),
		// Set to GRN.paymentReference of the first matched receipt when the
		// invoice approves for payment, so AP can group payables by PO + GRN.
		paymentReference: text('payment_reference'),
		paymentTriggeredAt: text('payment_triggered_at'),
		createdByUserId: text('created_by_user_id'),
		createdByEmail: text('created_by_email'),
		notes: text('notes'),
		...timeFields
	},
	(table) => [
		index('idx_procurement_supplier_invoices_supplier').on(table.supplierId),
		index('idx_procurement_supplier_invoices_po').on(table.poId),
		index('idx_procurement_supplier_invoices_status').on(table.status),
		index('idx_procurement_supplier_invoices_match').on(table.matchStatus),
		index('idx_procurement_supplier_invoices_approval').on(table.approvalStatus),
		index('idx_procurement_supplier_invoices_exception').on(table.iaExceptionCode)
	]
);

export const procurementSupplierInvoiceLines = sqliteTable(
	'procurement_supplier_invoice_lines',
	{
		id: text('id').primaryKey(),
		invoiceId: text('invoice_id')
			.notNull()
			.references(() => procurementSupplierInvoices.id),
		// Lines tie to a PO item directly; without that link we cannot do the
		// match, so `matchStatus='no_po'` and the row is review-only.
		poItemId: text('po_item_id').references(() => procurementPurchaseOrderItems.id),
		// Optional pointer to the GRN row used to validate qty. Recomputed by
		// runThreeWayMatch — if multiple GRNs feed one invoice line we keep the
		// most recent one here for display.
		receiptId: text('receipt_id').references(() => procurementPurchaseOrderReceipts.id),
		description: text('description').notNull(),
		itemCode: text('item_code'),
		quantityInvoiced: real('quantity_invoiced').notNull().default(0),
		unitPriceInvoiced: real('unit_price_invoiced').notNull().default(0),
		lineSubtotal: real('line_subtotal').notNull().default(0),
		taxCode: text('tax_code', { enum: ['SR', 'ZR', 'ES', 'OP'] }),
		// Snapshot values copied from the PO line / GRN at the time of match;
		// they let the reviewer see what we compared against without rejoining.
		poUnitPrice: real('po_unit_price'),
		poQuantityOrdered: real('po_quantity_ordered'),
		quantityReceivedMatched: real('quantity_received_matched').notNull().default(0),
		quantityPreviouslyInvoiced: real('quantity_previously_invoiced').notNull().default(0),
		priceVariancePct: real('price_variance_pct'),
		qtyVariance: real('qty_variance'),
		lineMatchStatus: text('line_match_status', {
			enum: [
				'unmatched',
				'matched',
				'qty_mismatch',
				'price_variance',
				'missing_grn',
				'no_po',
				'over_invoiced'
			]
		})
			.notNull()
			.default('unmatched'),
		iaExceptionCode: text('ia_exception_code'),
		approvalOverride: integer('approval_override', { mode: 'boolean' }).notNull().default(false),
		approvalOverrideReason: text('approval_override_reason'),
		notes: text('notes'),
		...timeFields
	},
	(table) => [
		index('idx_procurement_invoice_lines_invoice').on(table.invoiceId),
		index('idx_procurement_invoice_lines_po_item').on(table.poItemId),
		index('idx_procurement_invoice_lines_match').on(table.lineMatchStatus)
	]
);
