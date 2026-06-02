import type { PageServerLoad } from './$types';
import { createInventoryApi } from '$modules/inventory';
import { createModuleContext } from '$platform/modules';

export const load: PageServerLoad = async (event) => {
	const itemId = event.url.searchParams.get('itemId') ?? undefined;
	const warehouseId = event.url.searchParams.get('warehouseId') ?? undefined;
	const movementType = event.url.searchParams.get('movementType') ?? undefined;
	const alertCode = event.url.searchParams.get('alertCode') ?? undefined;

	if (!event.platform) {
		return { filters: { itemId, warehouseId, movementType, alertCode }, movements: [], items: [], warehouses: [] };
	}
	const ctx = await createModuleContext(event);
	const inventory = createInventoryApi(ctx);
	const [movements, items, warehouses] = await Promise.all([
		inventory.listAllMovements({
			itemId,
			warehouseId,
			movementType: movementType as any,
			alertCode,
			limit: 500
		}),
		inventory.listItems(),
		inventory.listWarehouses()
	]);
	return {
		filters: { itemId, warehouseId, movementType, alertCode },
		movements,
		items: items.map((i) => ({ id: i.id, code: i.code, name: i.name })),
		warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name }))
	};
};
