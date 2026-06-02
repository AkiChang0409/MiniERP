import type { Actions, PageServerLoad } from './$types';

import { fail } from '@sveltejs/kit';
import { createProcurementApi } from '$modules/procurement';
import { createModuleContext } from '$platform/modules';

function text(form: FormData, key: string) {
	const value = String(form.get(key) ?? '').trim();
	return value || undefined;
}

function num(form: FormData, key: string) {
	const value = Number(form.get(key));
	return Number.isFinite(value) ? value : undefined;
}

function parseItemRows(form: FormData) {
	const codes = form.getAll('itemCode').map(String);
	const descriptions = form.getAll('itemDescription').map(String);
	const quantities = form.getAll('itemQuantity').map(String);
	const uoms = form.getAll('itemUom').map(String);
	const targetPrices = form.getAll('itemTargetUnitPrice').map(String);
	const max = Math.max(codes.length, descriptions.length, quantities.length, uoms.length, targetPrices.length);
	const items = [];
	for (let i = 0; i < max; i += 1) {
		const itemCode = (codes[i] ?? '').trim();
		const description = (descriptions[i] ?? '').trim();
		if (!itemCode && !description) continue;
		const quantity = Number(quantities[i]);
		const targetUnitPrice = Number(targetPrices[i]);
		items.push({
			itemCode: itemCode || undefined,
			description: description || itemCode,
			quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
			uom: (uoms[i] ?? '').trim() || 'unit',
			targetUnitPrice: Number.isFinite(targetUnitPrice) && targetUnitPrice >= 0 ? targetUnitPrice : undefined
		});
	}
	return items;
}

function parsePoItemRows(form: FormData) {
	const codes = form.getAll('poItemCode').map(String);
	const descriptions = form.getAll('poItemDescription').map(String);
	const quantities = form.getAll('poItemQuantity').map(String);
	const uoms = form.getAll('poItemUom').map(String);
	const unitPrices = form.getAll('poItemUnitPrice').map(String);
	const taxCodes = form.getAll('poItemTaxCode').map(String);
	const max = Math.max(
		codes.length,
		descriptions.length,
		quantities.length,
		uoms.length,
		unitPrices.length,
		taxCodes.length
	);
	const items = [];
	for (let i = 0; i < max; i += 1) {
		const itemCode = (codes[i] ?? '').trim();
		const description = (descriptions[i] ?? '').trim();
		if (!itemCode && !description) continue;
		const quantity = Number(quantities[i]);
		const unitPrice = Number(unitPrices[i]);
		items.push({
			itemCode: itemCode || undefined,
			description: description || itemCode,
			quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
			uom: (uoms[i] ?? '').trim() || 'unit',
			unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0,
			taxCode: (taxCodes[i] || undefined) as 'SR' | 'ZR' | 'ES' | 'OP' | undefined
		});
	}
	return items;
}

export const load: PageServerLoad = async (event) => {
	const selectedRfqId = event.url.searchParams.get('rfq') ?? '';
	if (!event.platform) {
		return {
			rfqs: [],
			suppliers: [],
			purchaseOrders: [],
			selectedRfqId,
			comparison: null
		};
	}

	const ctx = await createModuleContext(event);
	const procurement = createProcurementApi(ctx);
	const [rfqs, suppliers, purchaseOrders] = await Promise.all([
		procurement.listRfqs(),
		procurement.listSuppliers(),
		procurement.listPurchaseOrders()
	]);
	const comparison = selectedRfqId ? await procurement.getRfqComparison(selectedRfqId) : null;
	return { rfqs, suppliers, purchaseOrders, selectedRfqId, comparison };
};

export const actions: Actions = {
	createRfq: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const form = await event.request.formData();
		const title = text(form, 'title');
		if (!title) return fail(400, { error: 'Missing RFQ title' });
		const items = parseItemRows(form);
		if (items.length === 0) return fail(400, { error: 'Add at least one RFQ item' });
		const supplierIds = form.getAll('supplierIds').map(String).filter(Boolean);
		if (supplierIds.length === 0) return fail(400, { error: 'Select at least one supplier' });
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		await procurement.createRfq({
			rfqNumber: text(form, 'rfqNumber'),
			title,
			sourceType: (text(form, 'sourceType') as 'purchase_requisition' | 'mrp_suggestion' | 'manual') ?? 'manual',
			sourceId: text(form, 'sourceId'),
			projectId: text(form, 'projectId'),
			currency: text(form, 'currency') ?? 'SGD',
			requiredByDate: text(form, 'requiredByDate'),
			notes: text(form, 'notes'),
			items,
			suppliers: supplierIds.map((supplierId) => ({ supplierId })),
			sendImmediately: form.get('sendImmediately') === 'on'
		});
		return { success: true };
	},

	submitQuotation: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const form = await event.request.formData();
		const rfqId = text(form, 'rfqId');
		const supplierId = text(form, 'supplierId');
		if (!rfqId || !supplierId) return fail(400, { error: 'Missing RFQ or supplier' });
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		const comparison = await procurement.getRfqComparison(rfqId);
		const items = comparison.items
			.map((item) => ({
				rfqItemId: item.id,
				quantity: num(form, `qty_${item.id}`) ?? Number(item.quantity ?? 1),
				unitPrice: num(form, `price_${item.id}`) ?? 0
			}))
			.filter((item) => item.unitPrice > 0);
		if (items.length === 0) return fail(400, { error: 'Enter at least one item price' });
		await procurement.submitSupplierQuotation(rfqId, {
			supplierId,
			quotationNumber: text(form, 'quotationNumber'),
			submittedAt: text(form, 'submittedAt'),
			currency: text(form, 'currency') ?? comparison.rfq.currency,
			leadTimeDays: num(form, 'leadTimeDays'),
			deliveryTerms: text(form, 'deliveryTerms'),
			paymentTerms: text(form, 'paymentTerms'),
			validityDate: text(form, 'validityDate'),
			shippingAmount: num(form, 'shippingAmount'),
			taxAmount: num(form, 'taxAmount'),
			dutiesAmount: num(form, 'dutiesAmount'),
			discountAmount: num(form, 'discountAmount'),
			notes: text(form, 'notes'),
			items
		});
		return { success: true };
	},

	selectWinner: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const form = await event.request.formData();
		const rfqId = text(form, 'rfqId');
		const quotationId = text(form, 'quotationId');
		if (!rfqId || !quotationId) return fail(400, { error: 'Missing RFQ or quotation' });
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		await procurement.selectWinningQuotation(rfqId, {
			quotationId,
			poNumber: text(form, 'poNumber'),
			poDate: text(form, 'poDate'),
			goodsReceiptDate: text(form, 'goodsReceiptDate'),
			deliveryDate: text(form, 'deliveryDate'),
			taxCode: text(form, 'taxCode') as 'SR' | 'ZR' | 'ES' | 'OP' | undefined,
			incoterms: text(form, 'incoterms'),
			billingAddress: text(form, 'billingAddress'),
			status:
				(text(form, 'status') as
					| 'draft'
					| 'pending_approval'
					| 'approved'
					| 'sent'
					| 'confirmed'
					| 'received') ?? 'draft',
			notes: text(form, 'notes')
		});
		return { success: true };
	},

	createPurchaseOrder: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const form = await event.request.formData();
		const supplierId = text(form, 'supplierId');
		if (!supplierId) return fail(400, { error: 'Select a supplier' });
		const items = parsePoItemRows(form);
		if (items.length === 0) return fail(400, { error: 'Add at least one PO item' });
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		await procurement.createPurchaseOrder({
			poNumber: text(form, 'poNumber'),
			sourceType:
				(text(form, 'sourceType') as 'purchase_requisition' | 'rfq' | 'mrp_suggestion' | 'manual') ??
				'manual',
			sourceId: text(form, 'sourceId'),
			supplierId,
			projectId: text(form, 'projectId'),
			poDate: text(form, 'poDate'),
			deliveryDate: text(form, 'deliveryDate'),
			currency: text(form, 'currency') ?? 'SGD',
			taxCode: text(form, 'taxCode') as 'SR' | 'ZR' | 'ES' | 'OP' | undefined,
			incoterms: text(form, 'incoterms'),
			billingAddress: text(form, 'billingAddress'),
			shippingAmount: num(form, 'shippingAmount'),
			taxAmount: num(form, 'taxAmount'),
			dutiesAmount: num(form, 'dutiesAmount'),
			notes: text(form, 'notes'),
			items
		});
		return { success: true };
	},

	approvePurchaseOrder: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const form = await event.request.formData();
		const poId = text(form, 'poId');
		if (!poId) return fail(400, { error: 'Missing PO' });
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		await procurement.updatePurchaseOrderApproval(poId, {
			action: (text(form, 'approvalAction') as 'approve' | 'reject') ?? 'approve',
			reason: text(form, 'reason')
		});
		return { success: true };
	},

	acknowledgePurchaseOrder: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const form = await event.request.formData();
		const poId = text(form, 'poId');
		if (!poId) return fail(400, { error: 'Missing PO' });
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		await procurement.recordPurchaseOrderAcknowledgment(poId, {
			ackStatus:
				(text(form, 'ackStatus') as 'requested' | 'acknowledged' | 'rejected' | 'overdue') ??
				'requested',
			acknowledgedAt: text(form, 'acknowledgedAt'),
			supplierAckReference: text(form, 'supplierAckReference')
		});
		return { success: true };
	},

	receivePurchaseOrder: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const form = await event.request.formData();
		const poId = text(form, 'poId');
		const poItemId = text(form, 'poItemId');
		if (!poId || !poItemId) return fail(400, { error: 'Missing PO item' });
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		await procurement.recordPurchaseOrderReceipt(poId, {
			poItemId,
			receiptNumber: text(form, 'receiptNumber'),
			receiptDate: text(form, 'receiptDate'),
			quantityReceived: num(form, 'quantityReceived') ?? 0,
			acceptedQuantity: num(form, 'acceptedQuantity'),
			rejectedQuantity: num(form, 'rejectedQuantity'),
			notes: text(form, 'notes')
		});
		return { success: true };
	}
};
