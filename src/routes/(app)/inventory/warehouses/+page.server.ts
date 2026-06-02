import type { PageServerLoad, Actions } from './$types';

import { createInventoryApi } from '$modules/inventory';
import { createModuleContext } from '$platform/modules';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) return { warehouses: [], stockSummaryByWarehouse: {} };
	const ctx = await createModuleContext(event);
	const inventory = createInventoryApi(ctx);
	const warehouses = await inventory.listWarehouses();
	const stock = await inventory.listStockLevels({});

	const summary: Record<string, { onHand: number; binsWithStock: number }> = {};
	for (const row of stock) {
		const wid = row.warehouse.id;
		if (!summary[wid]) summary[wid] = { onHand: 0, binsWithStock: 0 };
		summary[wid].onHand += Number(row.level.quantityOnHand) || 0;
		if (Number(row.level.quantityOnHand) > 0) summary[wid].binsWithStock += 1;
	}

	return { warehouses, stockSummaryByWarehouse: summary };
};

export const actions: Actions = {
	delete: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const data = await event.request.formData();
		const id = data.get('id');
		if (typeof id !== 'string') return fail(400, { error: 'Missing id' });
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		await inventory.deleteWarehouse(id);
		return { success: true };
	}
};
