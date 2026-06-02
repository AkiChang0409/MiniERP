import type { RequestHandler } from './$types';

import { createModuleContext } from '$platform/modules';
import { createSalesCrmApi } from '$modules/sales-crm';
import { fail, ok } from '$platform/http';

export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const salesCrm = createSalesCrmApi(ctx);
		const customers = await salesCrm.listCustomers();
		return ok(customers);
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const salesCrm = createSalesCrmApi(ctx);

		const body = (await event.request.json()) as {
			name?: string;
			address?: string;
			contact?: string;
			gstRegNo?: string;
			metadata?: unknown;
		};

		if (!body.name) {
			return fail('Missing required field: name');
		}

		const result = await salesCrm.createCustomer({
			name: body.name,
			address: body.address,
			contact: body.contact,
			gstRegNo: body.gstRegNo,
			metadata: body.metadata ? JSON.stringify(body.metadata) : undefined
		});

		return ok({ id: result.id }, 201);
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};

