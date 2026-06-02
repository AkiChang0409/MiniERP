import type { PageServerLoad } from './$types';
import { createInventoryApi } from '$modules/inventory';
import { createModuleContext } from '$platform/modules';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) return { counts: [], warehousesById: {} };
	const ctx = await createModuleContext(event);
	const inventory = createInventoryApi(ctx);
	const [counts, warehouses] = await Promise.all([
		inventory.listCycleCounts(),
		inventory.listWarehouses()
	]);
	return {
		counts,
		warehousesById: warehouses.reduce<Record<string, { code: string; name: string }>>((acc, w) => {
			acc[w.id] = { code: w.code, name: w.name };
			return acc;
		}, {})
	};
};
