import type { Actions, PageServerLoad } from './$types';

import { fail, redirect } from '@sveltejs/kit';
import { createProcurementApi } from '$modules/procurement';
import { createModuleContext } from '$platform/modules';

function text(form: FormData, key: string) {
	const value = String(form.get(key) ?? '').trim();
	return value || undefined;
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
			targetUnitPrice:
				Number.isFinite(targetUnitPrice) && targetUnitPrice >= 0 ? targetUnitPrice : undefined
		});
	}
	return items;
}

export const load: PageServerLoad = async (event) => {
	if (!event.platform) return { rfqs: [], suppliers: [] };
	const ctx = await createModuleContext(event);
	const procurement = createProcurementApi(ctx);
	const [rfqs, suppliers] = await Promise.all([
		procurement.listRfqs(),
		procurement.listSuppliers()
	]);
	return { rfqs, suppliers };
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
		const created = await procurement.createRfq({
			rfqNumber: text(form, 'rfqNumber'),
			title,
			sourceType:
				(text(form, 'sourceType') as 'purchase_requisition' | 'mrp_suggestion' | 'manual') ??
				'manual',
			sourceId: text(form, 'sourceId'),
			projectId: text(form, 'projectId'),
			currency: text(form, 'currency') ?? 'SGD',
			requiredByDate: text(form, 'requiredByDate'),
			notes: text(form, 'notes'),
			items,
			suppliers: supplierIds.map((supplierId) => ({ supplierId })),
			sendImmediately: form.get('sendImmediately') === 'on'
		});
		redirect(303, `/procurement/rfqs/${created.id}`);
	}
};
