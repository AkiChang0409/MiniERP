import type { RequestHandler } from './$types';

import { createProcurementApi } from '$modules/procurement';
import { ok, fail } from '$platform/http';
import { createModuleContext } from '$platform/modules';

export const POST: RequestHandler = async (event) => {
	try {
		const body = (await event.request.json()) as Parameters<
			ReturnType<typeof createProcurementApi>['recordSupplierInvoiceDecision']
		>[1];
		if (!body?.action) return fail('Missing required field: action');
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		const invoice = await procurement.recordSupplierInvoiceDecision(event.params.id!, body);
		return ok(invoice);
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
