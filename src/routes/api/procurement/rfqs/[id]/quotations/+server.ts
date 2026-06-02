import type { RequestHandler } from './$types';

import { createProcurementApi } from '$modules/procurement';
import { ok, fail } from '$platform/http';
import { createModuleContext } from '$platform/modules';

export const POST: RequestHandler = async (event) => {
	try {
		const body = (await event.request.json()) as Parameters<
			ReturnType<typeof createProcurementApi>['submitSupplierQuotation']
		>[1];
		if (!body?.supplierId) return fail('Missing required field: supplierId');
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		const quotation = await procurement.submitSupplierQuotation(event.params.id, body);
		return ok(quotation, 201);
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
