import type { RequestHandler } from './$types';

import { createModuleContext } from '$platform/modules';
import { createInventoryApi } from '$modules/inventory';
import { fail, ok } from '$platform/http';

export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		return ok(await inventory.listWarehouses());
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		const body = (await event.request.json()) as any;
		if (!body?.code || !body?.name) return fail('Missing code/name', 400);
		return ok(await inventory.createWarehouse(body), 201);
	} catch (e) {
		const code = (e as { code?: string }).code;
		const status = code === 'CONFLICT' ? 409 : code === 'VALIDATION_ERROR' ? 400 : 500;
		return fail((e as Error).message, status);
	}
};
