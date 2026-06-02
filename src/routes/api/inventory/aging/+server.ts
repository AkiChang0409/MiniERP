import type { RequestHandler } from './$types';

import { createModuleContext } from '$platform/modules';
import { createInventoryApi } from '$modules/inventory';
import { fail, ok } from '$platform/http';

export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		const warehouseId = event.url.searchParams.get('warehouseId') ?? undefined;
		const asOf = event.url.searchParams.get('asOf') ?? undefined;
		return ok(await inventory.getInventoryAging({ warehouseId, asOf }));
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
