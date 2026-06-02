import type { RequestHandler } from './$types';

import { createModuleContext } from '$platform/modules';
import { createInventoryApi } from '$modules/inventory';
import { fail, ok } from '$platform/http';

export const GET: RequestHandler = async (event) => {
	try {
		const value = event.url.searchParams.get('value');
		if (!value) return fail('Missing query parameter: value', 400);
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);

		const itemMatch = await inventory.lookupByBarcode(value);
		if (itemMatch) return ok({ kind: 'item', ...itemMatch });

		const binMatch = await inventory.lookupBinByBarcode(value);
		if (binMatch) return ok({ kind: 'bin', ...binMatch });

		return fail('Barcode not found', 404);
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
