import type { RequestHandler } from './$types';

import { createProcurementApi } from '$modules/procurement';
import { ok, fail } from '$platform/http';
import { createModuleContext } from '$platform/modules';

export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		return ok(await procurement.getRfqComparison(event.params.id));
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
