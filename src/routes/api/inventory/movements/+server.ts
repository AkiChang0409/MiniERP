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
		const movementType = event.url.searchParams.get('movementType') ?? undefined;
		const alertCode = event.url.searchParams.get('alertCode') ?? undefined;
		const limitStr = event.url.searchParams.get('limit');
		const limit = limitStr ? Number(limitStr) : undefined;
		return ok(
			await inventory.listAllMovements({
				itemId,
				warehouseId,
				movementType: movementType as any,
				alertCode,
				limit
			})
		);
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
