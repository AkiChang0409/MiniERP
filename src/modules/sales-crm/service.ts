import type { ModuleContext } from '$platform/modules/types';
import { NotFoundError } from '$platform/modules/errors';
import { CustomerRepository } from './repository';

export class SalesCrmService {
	private customers: CustomerRepository;

	constructor(ctx: ModuleContext) {
		this.customers = new CustomerRepository(ctx.db);
	}

	async getCustomerById(id: string) {
		return this.customers.findById(id);
	}

	async listCustomers() {
		return this.customers.findAll();
	}

	async listCustomerOptions() {
		return this.customers.listOptions();
	}

	async listCustomerDirectory() {
		return this.customers.listDirectory();
	}

	async createCustomer(data: { name: string; address?: string; contact?: string; gstRegNo?: string; metadata?: string }) {
		return this.customers.create(data);
	}

	async deleteCustomer(id: string) {
		const customer = await this.customers.findById(id);
		if (!customer) throw new NotFoundError('Customer', id);
		await this.customers.softDelete(id);
	}
}
