import { beforeEach, describe, expect, it, vi } from 'vitest';
import { salesCrmListBusinessPartnersCapability } from '$modules/sales-crm/ai-capabilities';

const mocks = vi.hoisted(() => ({
	listCustomerDirectory: vi.fn()
}));

vi.mock('$modules/sales-crm/api', () => ({
	createSalesCrmApi: () => ({
		listCustomerDirectory: mocks.listCustomerDirectory
	})
}));

describe('salesCrmListBusinessPartnersCapability', () => {
	beforeEach(() => {
		mocks.listCustomerDirectory.mockReset();
	});

	it('returns customer directory data through an explicit tool', async () => {
		mocks.listCustomerDirectory.mockResolvedValue([
			{ id: 'cus_1', name: 'Acme Pte Ltd', contact: 'Alice', address: 'Singapore' },
			{ id: 'cus_2', name: 'Beta Trading', contact: null, address: null }
		]);

		const output = await salesCrmListBusinessPartnersCapability.execute(
			{ limit: 10 },
			{
				moduleContext: {} as never
			}
		);

		expect(output).toEqual({
			count: 2,
			returned: 2,
			truncated: false,
			customers: [
				{ id: 'cus_1', name: 'Acme Pte Ltd', contact: 'Alice', address: 'Singapore' },
				{ id: 'cus_2', name: 'Beta Trading', contact: null, address: null }
			]
		});
	});
});
