import type { PageServerLoad } from './$types';
import { createInventoryApi } from '$modules/inventory';
import { createModuleContext } from '$platform/modules';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) return { transfers: [], warehousesById: {} };
	const ctx = await createModuleContext(event);
	const inventory = createInventoryApi(ctx);
	const [transfers, warehouses] = await Promise.all([
		inventory.listTransfers(),
		inventory.listWarehouses()
	]);
	const warehousesById = Object.fromEntries(
		warehouses.map((w) => [w.id, { code: w.code, name: w.name }])
	);
	return { transfers, warehousesById };
};
