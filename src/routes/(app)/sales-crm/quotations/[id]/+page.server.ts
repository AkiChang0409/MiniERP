import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createModuleContext } from '$platform/modules';
import { createSalesCrmApi } from '$modules/sales-crm';
import { NotFoundError } from '$platform/modules/errors';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) throw error(503, 'Platform unavailable');
	const ctx = await createModuleContext(event);
	const salesCrm = createSalesCrmApi(ctx);
	try {
		return await salesCrm.getQuotation(event.params.id);
	} catch (e) {
		if (e instanceof NotFoundError) throw error(404, 'Quotation not found');
		throw error(500, (e as Error).message);
	}
};

export const actions: Actions = {
	convert: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const ctx = await createModuleContext(event);
		const salesCrm = createSalesCrmApi(ctx);
		let orderId: string;
		try {
			const order = await salesCrm.convertQuotationToOrder(event.params.id);
			orderId = order.id;
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		throw redirect(303, `/sales-crm/orders/${orderId}`);
	}
};
