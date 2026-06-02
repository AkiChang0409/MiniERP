import type { ModuleContext } from '$platform/modules/types';
import { SalesCrmService } from './service';

export type SalesCrmApi = ReturnType<typeof createSalesCrmApi>;

export function createSalesCrmApi(ctx: ModuleContext) {
	const svc = new SalesCrmService(ctx);

	return {
		getCustomerById: svc.getCustomerById.bind(svc),
		listCustomers: svc.listCustomers.bind(svc),
		listCustomerOptions: svc.listCustomerOptions.bind(svc),
		listCustomerDirectory: svc.listCustomerDirectory.bind(svc),
		createCustomer: svc.createCustomer.bind(svc),
		deleteCustomer: svc.deleteCustomer.bind(svc)
	};
}
