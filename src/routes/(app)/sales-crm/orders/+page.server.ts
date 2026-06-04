import type { PageServerLoad } from './$types';
import { createModuleContext } from '$platform/modules';
import { createSalesCrmApi } from '$modules/sales-crm';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) return { orders: [], customers: [] };
	const ctx = await createModuleContext(event);
	const salesCrm = createSalesCrmApi(ctx);
	const [orders, customers] = await Promise.all([
		salesCrm.listSalesOrders(),
		salesCrm.listCustomerOptions()
	]);
	const nameById = new Map(customers.map((c) => [c.id, c.name]));
	return {
		orders: orders.map((o) => ({ ...o, customerName: nameById.get(o.customerId) ?? o.customerId })),
		customers
	};
};
