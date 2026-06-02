import type { RequestHandler } from './$types';

import { createModuleContext } from '$platform/modules';
import { createInventoryApi } from '$modules/inventory';
import { fail, ok } from '$platform/http';

export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		const itemId = event.url.searchParams.get('itemId') ?? undefined;
		const warehouseId = event.url.searchParams.get('warehouseId') ?? undefined;
		const binLocationId = event.url.searchParams.get('binId') ?? undefined;
		return ok(await inventory.listStockLevels({ itemId, warehouseId, binLocationId }));
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		const body = (await event.request.json()) as any;
		const result = await inventory.adjustStock(body);
		return ok(result, 201);
	} catch (e) {
		const c = (e as { code?: string }).code;
		const status = c === 'VALIDATION_ERROR' ? 400 : c === 'NOT_FOUND' ? 404 : 500;
		return fail((e as Error).message, status);
	}
};
