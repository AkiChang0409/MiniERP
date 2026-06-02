import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { createInventoryApi } from '$modules/inventory';
import { createModuleContext } from '$platform/modules';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) throw error(503, 'Platform unavailable');
	const ctx = await createModuleContext(event);
	const inventory = createInventoryApi(ctx);
	try {
		const detail = await inventory.getTransferDetail(event.params.id!);
		const warehouses = await inventory.listWarehouses();
		const warehousesById = Object.fromEntries(warehouses.map((w) => [w.id, w]));
		const sourceWh = warehousesById[detail.transfer.sourceWarehouseId];
		const destWh = warehousesById[detail.transfer.destWarehouseId];

		// Hydrate item + bin info per line.
		const allBinIds = new Set<string>();
		const allItemIds = new Set<string>();
		for (const line of detail.lines) {
			allBinIds.add(line.sourceBinId);
			allBinIds.add(line.destBinId);
			allItemIds.add(line.itemId);
		}
		const itemRows = await Promise.all(
			[...allItemIds].map((id) =>
				inventory.getItemDetail(id).then((r) => ({
					id,
					code: r.item.code,
					name: r.item.name,
					uom: r.item.uom
				}))
			)
		);
		const itemMap = new Map(itemRows.map((r) => [r.id, r]));

		const binRows = await Promise.all(
			[...allBinIds].map((id) =>
				inventory.getBinDetail(id).then((b) => ({ id, code: b.code, locationType: b.locationType, warehouseId: b.warehouseId }))
			)
		);
		const binMap = new Map(binRows.map((b) => [b.id, b]));

		return {
			transfer: detail.transfer,
			sourceWh,
			destWh,
			lines: detail.lines.map((line) => ({
				...line,
				item: itemMap.get(line.itemId) ?? null,
				sourceBin: binMap.get(line.sourceBinId) ?? null,
				destBin: binMap.get(line.destBinId) ?? null
			}))
		};
	} catch (e) {
		if ((e as { code?: string }).code === 'NOT_FOUND') throw error(404, 'Transfer not found');
		throw e;
	}
};

export const actions: Actions = {
	ship: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		try {
			const ctx = await createModuleContext(event);
			const inventory = createInventoryApi(ctx);
			await inventory.shipTransfer(event.params.id!);
			return { shipped: true };
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
	},

	receive: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		const data = await event.request.formData();
		const lineIds = data.getAll('line_id');
		const actualQtys = data.getAll('actual_qty');
		const actuals: Array<{ lineId: string; quantityReceived: number }> = [];
		for (let i = 0; i < lineIds.length; i++) {
			const lineId = String(lineIds[i] ?? '');
			const qty = Number(actualQtys[i] ?? 0);
			if (lineId && Number.isFinite(qty)) {
				actuals.push({ lineId, quantityReceived: qty });
			}
		}
		try {
			const ctx = await createModuleContext(event);
			const inventory = createInventoryApi(ctx);
			await inventory.receiveTransfer(event.params.id!, actuals);
			return { received: true };
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
	},

	cancel: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		try {
			const ctx = await createModuleContext(event);
			const inventory = createInventoryApi(ctx);
			await inventory.cancelTransfer(event.params.id!);
			return { cancelled: true };
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
	}
};
