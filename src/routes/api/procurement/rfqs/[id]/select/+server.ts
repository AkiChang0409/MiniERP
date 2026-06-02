import type { RequestHandler } from './$types';

import { createProcurementApi } from '$modules/procurement';
import { ok, fail } from '$platform/http';
import { createModuleContext } from '$platform/modules';

export const POST: RequestHandler = async (event) => {
	try {
		const body = (await event.request.json()) as Parameters<
			ReturnType<typeof createProcurementApi>['selectWinningQuotation']
		>[1];
		if (!body?.quotationId) return fail('Missing required field: quotationId');
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		const po = await procurement.selectWinningQuotation(event.params.id, body);
		return ok(po, 201);
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
