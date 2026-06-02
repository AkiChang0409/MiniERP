import type { RequestHandler } from './$types';

import { createModuleContext } from '$platform/modules';
import { createInventoryApi } from '$modules/inventory';
import { fail, ok } from '$platform/http';

export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		const items = await inventory.listItems();
		return ok(items);
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		const body = (await event.request.json()) as Record<string, unknown>;
		if (!body.code || !body.name) return fail('Missing code/name', 400);
		const result = await inventory.createItem(body as any);
		return ok(result, 201);
	} catch (e) {
		const status = (e as { code?: string }).code === 'CONFLICT' ? 409 : 500;
		return fail((e as Error).message, status);
	}
};
