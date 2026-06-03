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

export const load: PageServerLoad = async (event) => {
	if (!event.platform) return { openPos: [], pendingReceipts: [] };
	const ctx = await createModuleContext(event);
	const procurement = createProcurementApi(ctx);
	const pos = await procurement.listPurchaseOrders();

	// "Open for receiving" = approved + has any unreceived qty. We exclude
	// drafts and rejected so the warehouse user sees a clean queue.
	const openPos = pos
		.filter(
			(p) =>
				(p.approvalStatus === 'approved' || p.approvalStatus === 'not_required') &&
				p.status !== 'cancelled' &&
				p.orderedQuantity > p.receivedQuantity
		)
		.map((p) => ({
			id: p.id,
			poNumber: p.poNumber,
			supplierName: p.supplier?.name ?? null,
			currency: p.currency,
			deliveryDate: p.deliveryDate,
			status: p.status,
			ackStatus: p.ackStatus,
			ordered: p.orderedQuantity,
			received: p.receivedQuantity,
			backOrder: p.backOrderedQuantity,
			lineCount: p.items.length
		}));

	// Cross-PO QC queue: every receipt currently waiting for inspection.
	const pendingReceipts = pos
		.flatMap((p) =>
			(p.receipts ?? [])
				.filter((r: any) => r.inspectionStatus === 'pending' || r.inspectionStatus === 'quarantined')
				.map((r: any) => ({
					poId: p.id,
					poNumber: p.poNumber,
					supplierName: p.supplier?.name ?? null,
					currency: p.currency,
					...r
				}))
		)
		.sort((a, b) => String(b.receiptDate).localeCompare(String(a.receiptDate)));

	return { openPos, pendingReceipts };
};

export const actions: Actions = {
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
