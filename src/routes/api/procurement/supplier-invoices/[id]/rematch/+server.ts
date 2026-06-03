import type { RequestHandler } from './$types';

import { createProcurementApi } from '$modules/procurement';
import { ok, fail } from '$platform/http';
import { createModuleContext } from '$platform/modules';

export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		const invoice = await procurement.runSupplierInvoiceRematch(event.params.id!);
		return ok(invoice);
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
