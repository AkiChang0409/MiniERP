import type { RequestHandler } from './$types';

import { createProcurementApi } from '$modules/procurement';
import { ok, fail } from '$platform/http';
import { createModuleContext } from '$platform/modules';

export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		return ok(await procurement.listRfqs());
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const body = (await event.request.json()) as Parameters<
			ReturnType<typeof createProcurementApi>['createRfq']
		>[0];
		if (!body?.title) return fail('Missing required field: title');
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		const rfq = await procurement.createRfq(body);
		return ok(rfq, 201);
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
