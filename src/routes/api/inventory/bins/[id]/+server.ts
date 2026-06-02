import type { RequestHandler } from './$types';

import { createModuleContext } from '$platform/modules';
import { createInventoryApi } from '$modules/inventory';
import { fail, ok } from '$platform/http';

export const PUT: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		const body = (await event.request.json()) as any;
		await inventory.updateBin(event.params.id!, body);
		return ok({ success: true });
	} catch (e) {
		const c = (e as { code?: string }).code;
		const status = c === 'NOT_FOUND' ? 404 : c === 'CONFLICT' ? 409 : 500;
		return fail((e as Error).message, status);
	}
};

export const DELETE: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		await inventory.deleteBin(event.params.id!);
		return ok({ success: true });
	} catch (e) {
		const status = (e as { code?: string }).code === 'NOT_FOUND' ? 404 : 500;
		return fail((e as Error).message, status);
	}
};
