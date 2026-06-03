import type { Actions, PageServerLoad } from './$types';

import { error, fail } from '@sveltejs/kit';
import { createInventoryApi } from '$modules/inventory';
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

export const load: PageServerLoad = async (event) => {
	if (!event.platform) error(503, 'Platform unavailable');
	const ctx = await createModuleContext(event);
	const procurement = createProcurementApi(ctx);
	const inventory = createInventoryApi(ctx);
	const allPos = await procurement.listPurchaseOrders();
	const po = allPos.find((p) => p.id === event.params.id);
	if (!po) error(404, `Purchase order ${event.params.id} not found`);
	const [warehouses, items] = await Promise.all([
		inventory.listWarehouses(),
		inventory.listItems()
	]);
	const binLists = await Promise.all(
		warehouses.map((wh) => inventory.listBinsForWarehouse(wh.id))
	);
	return { po, warehouses, bins: binLists.flat(), inventoryItems: items };
};

export const actions: Actions = {
	approvePurchaseOrder: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const form = await event.request.formData();
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		await procurement.updatePurchaseOrderApproval(event.params.id, {
			action: (text(form, 'approvalAction') as 'approve' | 'reject') ?? 'approve',
			reason: text(form, 'reason')
		});
		return { success: true };
	},

	acknowledgePurchaseOrder: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const form = await event.request.formData();
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		await procurement.recordPurchaseOrderAcknowledgment(event.params.id, {
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
		const poItemId = text(form, 'poItemId');
		if (!poItemId) return fail(400, { error: 'Missing PO item' });
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		try {
			await procurement.recordPurchaseOrderReceipt(event.params.id, {
				poItemId,
				receiptNumber: text(form, 'receiptNumber'),
				receiptDate: text(form, 'receiptDate'),
				quantityReceived: num(form, 'quantityReceived') ?? 0,
				acceptedQuantity: num(form, 'acceptedQuantity'),
				rejectedQuantity: num(form, 'rejectedQuantity'),
				itemId: text(form, 'itemId'),
				warehouseId: text(form, 'warehouseId'),
				binLocationId: text(form, 'binLocationId'),
				quarantineBinId: text(form, 'quarantineBinId'),
				unitCost: num(form, 'unitCost'),
				inspectionRequired: form.get('inspectionRequired') === 'on' ? true : undefined,
				notes: text(form, 'notes')
			});
		} catch (err) {
			return fail(400, { error: (err as Error).message });
		}
		return { success: true };
	},

	inspectReceipt: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const form = await event.request.formData();
		const receiptId = text(form, 'receiptId');
		const decision = text(form, 'decision') as 'accept' | 'reject' | 'quarantine' | undefined;
		if (!receiptId || !decision) return fail(400, { error: 'Missing receipt or decision' });
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		try {
			await procurement.recordReceiptInspection(receiptId, {
				decision,
				acceptedQuantity: num(form, 'acceptedQuantity'),
				rejectedQuantity: num(form, 'rejectedQuantity'),
				reason: text(form, 'reason'),
				notes: text(form, 'notes'),
				returnRequired: form.get('returnRequired') === 'on'
			});
		} catch (err) {
			return fail(400, { error: (err as Error).message });
		}
		return { success: true };
	}
};
