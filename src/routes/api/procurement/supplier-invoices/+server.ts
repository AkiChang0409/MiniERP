import type { RequestHandler } from './$types';

import { createProcurementApi } from '$modules/procurement';
import { ok, fail } from '$platform/http';
import { createModuleContext } from '$platform/modules';

export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		return ok(await procurement.listSupplierInvoices());
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const body = (await event.request.json()) as Parameters<
			ReturnType<typeof createProcurementApi>['createSupplierInvoice']
		>[0];
		if (!body?.invoiceNumber) return fail('Missing required field: invoiceNumber');
		if (!Array.isArray(body?.lines) || body.lines.length === 0) {
			return fail('Supplier invoice requires at least one line');
		}
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		const invoice = await procurement.createSupplierInvoice(body);
		return ok(invoice, 201);
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
