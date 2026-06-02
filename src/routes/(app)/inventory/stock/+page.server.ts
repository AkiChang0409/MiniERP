import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { createInventoryApi } from '$modules/inventory';
import { createModuleContext } from '$platform/modules';

export const load: PageServerLoad = async (event) => {
	const itemId = event.url.searchParams.get('itemId') ?? undefined;
	const warehouseId = event.url.searchParams.get('warehouseId') ?? undefined;
	const binId = event.url.searchParams.get('binId') ?? undefined;

	if (!event.platform) {
		return {
			filters: { itemId, warehouseId, binId },
			stockLevels: [],
			items: [],
			warehouses: [],
			bins: []
		};
	}

	const ctx = await createModuleContext(event);
	const inventory = createInventoryApi(ctx);
	const [stockLevels, items, warehouses] = await Promise.all([
		inventory.listStockLevels({ itemId, warehouseId, binLocationId: binId }),
		inventory.listItems(),
		inventory.listWarehouses()
	]);
	const bins = warehouseId ? await inventory.listBinsForWarehouse(warehouseId) : [];

	return {
		filters: { itemId, warehouseId, binId },
		stockLevels,
		items: items.map((i) => ({ id: i.id, code: i.code, name: i.name, uom: i.uom })),
		warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name })),
		bins: bins.map((b) => ({ id: b.id, code: b.code, name: b.name, locationType: b.locationType }))
	};
};

export const actions: Actions = {
	adjust: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		const data = await event.request.formData();
		const get = (k: string) => (data.get(k) as string | null)?.trim() || undefined;
		const itemId = get('itemId');
		const warehouseId = get('warehouseId');
		const binLocationId = get('binLocationId');
		const deltaStr = get('quantityDelta');
		const movementType = (get('movementType') as any) || undefined;
		const reasonCode = get('reasonCode');
		const unitCostStr = get('unitCost');
		const physicalCountDocumentRef = get('physicalCountDocumentRef');
		const notes = get('notes');
		if (!itemId || !warehouseId || !binLocationId || !deltaStr) {
			return fail(400, { message: 'itemId / warehouseId / binLocationId / quantityDelta are required' });
		}
		const quantityDelta = Number(deltaStr);
		if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
			return fail(400, { message: 'quantityDelta must be a non-zero number' });
		}
		try {
			const ctx = await createModuleContext(event);
			const inventory = createInventoryApi(ctx);
			const result = await inventory.adjustStock({
				itemId,
				warehouseId,
				binLocationId,
				quantityDelta,
				movementType,
				reasonCode,
				unitCost: unitCostStr !== undefined ? Number(unitCostStr) : undefined,
				physicalCountDocumentRef,
				notes
			});
			return {
				adjustedQty: result.quantityAfter,
				valueDelta: result.valueDelta,
				iaAlertCode: result.iaAlertCode
			};
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
	}
};
