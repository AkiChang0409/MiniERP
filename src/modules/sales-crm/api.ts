import type { ModuleContext } from '$platform/modules/types';
import { SalesCrmService } from './service';
import { BitableCustomerRepository } from './customer-source';

export type SalesCrmApi = ReturnType<typeof createSalesCrmApi>;

export function createSalesCrmApi(ctx: ModuleContext) {
	// Bitable-as-source-of-truth: when the Business Partner table id is configured,
	// read customers from the Bitable mirror; otherwise fall back to legacy D1.
	const bpTable = ctx.env?.LARK_BP_TABLE_ID;
	const source = bpTable ? new BitableCustomerRepository(ctx.db, bpTable) : undefined;
	const svc = new SalesCrmService(ctx, source);

	return {
		getCustomerById: svc.getCustomerById.bind(svc),
		listCustomers: svc.listCustomers.bind(svc),
		listCustomerOptions: svc.listCustomerOptions.bind(svc),
		listCustomerDirectory: svc.listCustomerDirectory.bind(svc),
		createCustomer: svc.createCustomer.bind(svc),
		deleteCustomer: svc.deleteCustomer.bind(svc)
	};
}
