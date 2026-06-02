import type { RequestHandler } from './$types';

import { createModuleContext } from '$platform/modules';
import { createInventoryApi } from '$modules/inventory';
import { fail, ok } from '$platform/http';

export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		const detail = await inventory.getItemDetail(event.params.id!);
		return ok(detail);
	} catch (e) {
		const status = (e as { code?: string }).code === 'NOT_FOUND' ? 404 : 500;
		return fail((e as Error).message, status);
	}
};

export const PUT: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		const body = (await event.request.json()) as Record<string, unknown>;
		const result = await inventory.updateItem(event.params.id!, body as any);
		return ok(result);
	} catch (e) {
		const code = (e as { code?: string }).code;
		const status = code === 'NOT_FOUND' ? 404 : code === 'CONFLICT' ? 409 : 500;
		return fail((e as Error).message, status);
	}
};

export const DELETE: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		await inventory.deleteItem(event.params.id!);
		return ok({ success: true });
	} catch (e) {
		const status = (e as { code?: string }).code === 'NOT_FOUND' ? 404 : 500;
		return fail((e as Error).message, status);
	}
};
