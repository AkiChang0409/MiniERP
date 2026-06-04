import type { PageServerLoad } from './$types';
import { createModuleContext } from '$platform/modules';
import { createSalesCrmApi } from '$modules/sales-crm';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) return { quotations: [] };
	const ctx = await createModuleContext(event);
	const salesCrm = createSalesCrmApi(ctx);
	const [quotations, customers] = await Promise.all([
		salesCrm.listQuotations(),
		salesCrm.listCustomerOptions()
	]);
	const nameById = new Map(customers.map((c) => [c.id, c.name]));
	return {
		quotations: quotations.map((q) => ({ ...q, customerName: nameById.get(q.customerId) ?? q.customerId }))
	};
};
