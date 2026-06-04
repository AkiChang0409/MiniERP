import type { PageServerLoad } from './$types';
import { createModuleContext } from '$platform/modules';
import { createSalesCrmApi } from '$modules/sales-crm';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		return { counts: { customers: 0, quotations: 0, orders: 0 }, flags: { ia002: 0, creditHold: 0, pendingApproval: 0 }, recentOrders: [] };
	}
	const ctx = await createModuleContext(event);
	const salesCrm = createSalesCrmApi(ctx);
	const [customers, quotations, orders] = await Promise.all([
		salesCrm.listCustomerOptions(),
		salesCrm.listQuotations(),
		salesCrm.listSalesOrders()
	]);
	const nameById = new Map(customers.map((c) => [c.id, c.name]));
	return {
		counts: { customers: customers.length, quotations: quotations.length, orders: orders.length },
		flags: {
			ia002: orders.filter((o) => o.iaExceptionCode === 'IA002').length,
			creditHold: orders.filter((o) => o.creditHoldFlag).length,
			pendingApproval: orders.filter((o) => o.approvalStatus === 'pending_approval').length
		},
		recentOrders: orders.slice(0, 8).map((o) => ({ ...o, customerName: nameById.get(o.customerId) ?? o.customerId }))
	};
};
