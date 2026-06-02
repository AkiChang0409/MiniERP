import type { RequestHandler } from './$types';

import { createModuleContext } from '$platform/modules';
import { createInventoryApi } from '$modules/inventory';
import { fail, ok } from '$platform/http';

export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		const body = (await event.request.json()) as {
			counts: Array<{ lineId: string; countedQuantity: number; notes?: string }>;
		};
		await inventory.recordCycleCounts(event.params.id!, body.counts ?? []);
		return ok({ success: true });
	} catch (e) {
		const c = (e as { code?: string }).code;
		const status = c === 'VALIDATION_ERROR' ? 400 : c === 'NOT_FOUND' ? 404 : 500;
		return fail((e as Error).message, status);
	}
};
