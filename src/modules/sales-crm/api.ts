import type { ModuleContext } from '$platform/modules/types';
import { SalesCrmService } from './service';
import { BitableCustomerRepository } from './customer-source';

export type SalesCrmApi = ReturnType<typeof createSalesCrmApi>;

function bitableAppToken(env: Env): string {
	const token = env.LARK_BITABLE_APP_TOKEN;
	if (!token) {
		throw new Error('LARK_BITABLE_APP_TOKEN is required for Sales CRM Lark writes.');
	}
	return token;
}

export function createSalesCrmApi(ctx: ModuleContext) {
	const bpTable = ctx.env?.LARK_BP_TABLE_ID;
	if (!bpTable) {
		throw new Error('LARK_BP_TABLE_ID is required: Sales CRM Business Partner data is sourced from Lark Base.');
	}
	const contactTable = ctx.env?.LARK_BP_CONTACT_TABLE_ID;
	const source = new BitableCustomerRepository(
		ctx.db,
		bpTable,
		contactTable,
		ctx.env,
		bitableAppToken(ctx.env)
	);
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
