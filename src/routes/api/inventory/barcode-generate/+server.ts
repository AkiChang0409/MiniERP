import type { RequestHandler } from './$types';

import { createModuleContext } from '$platform/modules';
import { createInventoryApi } from '$modules/inventory';
import { fail, ok } from '$platform/http';

export const GET: RequestHandler = async (event) => {
	try {
		const itemCode = event.url.searchParams.get('itemCode') ?? 'ITEM';
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		return ok({ value: inventory.generateBarcode(itemCode) });
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
