import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createModuleContext } from '$platform/modules';
import { createSalesCrmApi } from '$modules/sales-crm';
import { NotFoundError } from '$platform/modules/errors';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) throw error(503, 'Platform unavailable');
	const ctx = await createModuleContext(event);
	const salesCrm = createSalesCrmApi(ctx);
	try {
		return await salesCrm.getSalesOrder(event.params.id);
	} catch (e) {
		if (e instanceof NotFoundError) throw error(404, 'Sales order not found');
		throw error(500, (e as Error).message);
	}
};

async function run(event: any, fn: (api: ReturnType<typeof createSalesCrmApi>) => Promise<unknown>) {
	if (!event.platform) return fail(503, { error: 'Platform unavailable' });
	const ctx = await createModuleContext(event);
	const salesCrm = createSalesCrmApi(ctx);
	try {
		await fn(salesCrm);
		return { success: true };
	} catch (e) {
		return fail(400, { error: (e as Error).message });
	}
}

export const actions: Actions = {
	approve: async (event) => {
		const f = await event.request.formData();
		return run(event, (api) =>
			api.approveSalesOrder(event.params.id, {
				action: f.get('action') === 'reject' ? 'reject' : 'approve',
				reason: String(f.get('reason') ?? '')
			})
		);
	},
	confirm: async (event) => {
		const f = await event.request.formData();
		return run(event, (api) =>
			api.confirmSalesOrder(event.params.id, {
				confirmedDeliveryDate: String(f.get('confirmedDeliveryDate') ?? '') || undefined
			})
		);
	},
	pick: async (event) => run(event, (api) => api.advanceSalesOrderStatus(event.params.id, 'picking')),
	pack: async (event) => run(event, (api) => api.advanceSalesOrderStatus(event.params.id, 'packed')),
	ship: async (event) => {
		const f = await event.request.formData();
		const shipments: any[] = [];
		for (const [key, value] of f.entries()) {
			if (!key.startsWith('ship_')) continue;
			const qty = Number(value);
			if (qty > 0) shipments.push({ orderItemId: key.slice(5), quantityShipped: qty });
		}
		if (shipments.length === 0) return fail(400, { error: 'Enter at least one quantity to ship' });
		return run(event, (api) => api.shipSalesOrder(event.params.id, shipments));
	},
	invoice: async (event) => run(event, (api) => api.invoiceSalesOrder(event.params.id))
};
