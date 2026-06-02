import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { createInventoryApi } from '$modules/inventory';
import { createModuleContext } from '$platform/modules';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		return { items: [], warehouses: [], binsByWarehouse: {} };
	}
	const ctx = await createModuleContext(event);
	const inventory = createInventoryApi(ctx);
	const [items, warehouses] = await Promise.all([
		inventory.listItems(),
		inventory.listWarehouses()
	]);
	const binsByWarehouse: Record<string, Array<{ id: string; code: string; locationType: string }>> = {};
	for (const w of warehouses) {
		const bins = await inventory.listBinsForWarehouse(w.id);
		binsByWarehouse[w.id] = bins.map((b) => ({ id: b.id, code: b.code, locationType: b.locationType }));
	}
	return {
		items: items.map((i) => ({ id: i.id, code: i.code, name: i.name, uom: i.uom })),
		warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name })),
		binsByWarehouse
	};
};

export const actions: Actions = {
	default: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		const data = await event.request.formData();
		const sourceWarehouseId = data.get('sourceWarehouseId');
		const destWarehouseId = data.get('destWarehouseId');
		if (typeof sourceWarehouseId !== 'string' || typeof destWarehouseId !== 'string') {
			return fail(400, { message: 'Source / destination warehouse required' });
		}
		const lineItemIds = data.getAll('line_itemId');
		const lineSrcBins = data.getAll('line_sourceBinId');
		const lineDstBins = data.getAll('line_destBinId');
		const lineQtys = data.getAll('line_quantity');
		const lineNotes = data.getAll('line_notes');
		const lines: any[] = [];
		for (let i = 0; i < lineItemIds.length; i++) {
			const itemId = String(lineItemIds[i] ?? '').trim();
			const sourceBinId = String(lineSrcBins[i] ?? '').trim();
			const destBinId = String(lineDstBins[i] ?? '').trim();
			const qty = Number(lineQtys[i] ?? 0);
			if (!itemId || !sourceBinId || !destBinId || !(qty > 0)) continue;
			lines.push({
				itemId,
				sourceBinId,
				destBinId,
				quantityRequested: qty,
				notes: String(lineNotes[i] ?? '').trim() || undefined
			});
		}
		if (lines.length === 0) {
			return fail(400, { message: 'At least one valid transfer line is required' });
		}
		try {
			const ctx = await createModuleContext(event);
			const inventory = createInventoryApi(ctx);
			const { id } = await inventory.createTransfer({
				sourceWarehouseId,
				destWarehouseId,
				notes: (data.get('notes') as string | null)?.trim() || undefined,
				lines
			});
			throw redirect(303, `/inventory/transfers/${id}`);
		} catch (e) {
			if (e instanceof Response) throw e;
			return fail(400, { message: (e as Error).message });
		}
	}
};
