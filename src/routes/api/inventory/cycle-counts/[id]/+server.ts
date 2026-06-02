import type { RequestHandler } from './$types';

import { createModuleContext } from '$platform/modules';
import { createInventoryApi } from '$modules/inventory';
import { fail, ok } from '$platform/http';

export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		return ok(await inventory.getCycleCountDetail(event.params.id!));
	} catch (e) {
		const status = (e as { code?: string }).code === 'NOT_FOUND' ? 404 : 500;
		return fail((e as Error).message, status);
	}
};
