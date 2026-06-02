import type { RequestHandler } from './$types';

import { createModuleContext } from '$platform/modules';
import { createInventoryApi } from '$modules/inventory';
import { fail, ok } from '$platform/http';

export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		return ok(await inventory.listBinsForWarehouse(event.params.id!));
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		const body = (await event.request.json()) as any;
		return ok(
			await inventory.createBin({ ...body, warehouseId: event.params.id! }),
			201
		);
	} catch (e) {
		const c = (e as { code?: string }).code;
		const status = c === 'CONFLICT' ? 409 : c === 'VALIDATION_ERROR' ? 400 : c === 'NOT_FOUND' ? 404 : 500;
		return fail((e as Error).message, status);
	}
};
