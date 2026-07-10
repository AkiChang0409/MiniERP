import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P2 governed write: `sales-crm.create-business-partner` maps its flat AI input
 * onto `createSalesCrmApi(ctx).createCustomer`, packing the Bitable-metadata
 * fields into the `metadata` JSON the encoder reads. The api call itself
 * write-throughs to the Lark Base + D1 mirror (covered elsewhere); here we assert
 * the capability's input mapping + output shape.
 */
const createCustomer = vi.fn(async (_input: unknown) => ({ id: 'bp_new_1' }));
vi.mock('$modules/sales-crm/api', () => ({
	createSalesCrmApi: () => ({ createCustomer })
}));

import { salesCrmCreateBusinessPartnerCapability } from '$modules/sales-crm/ai-capabilities';

describe('sales-crm.create-business-partner (governed write)', () => {
	beforeEach(() => createCustomer.mockClear());

	it('is an R4 write capability', () => {
		expect(salesCrmCreateBusinessPartnerCapability.id).toBe('sales-crm.create-business-partner');
		expect(salesCrmCreateBusinessPartnerCapability.riskLevel).toBe('R4');
	});

	it('packs metadata-driven fields into metadata JSON and returns {id,name}', async () => {
		const result = await salesCrmCreateBusinessPartnerCapability.execute(
			{
				name: 'Acme Pte Ltd',
				address: '1 Raffles Place',
				country: 'Singapore',
				currency: 'USD',
				email: 'ap@acme.com',
				contactName: 'Jane Doe',
				contactPhone: '+65 8000 0000'
			},
			{ moduleContext: {} as never }
		);

		expect(result).toEqual({ id: 'bp_new_1', name: 'Acme Pte Ltd' });
		expect(createCustomer).toHaveBeenCalledTimes(1);

		const arg = createCustomer.mock.calls[0][0] as {
			name: string;
			address: string | null;
			contactName: string | null;
			contactPhone: string | null;
			metadata: string | null;
		};
		expect(arg.name).toBe('Acme Pte Ltd');
		expect(arg.address).toBe('1 Raffles Place');
		expect(arg.contactName).toBe('Jane Doe');
		expect(arg.contactPhone).toBe('+65 8000 0000');
		const meta = JSON.parse(arg.metadata ?? '{}');
		expect(meta).toMatchObject({ country: 'Singapore', currency: 'USD', email: 'ap@acme.com' });
	});
});
