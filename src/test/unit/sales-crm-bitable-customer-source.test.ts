import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BitableCustomerRepository } from '$modules/sales-crm/customer-source';

const mocks = vi.hoisted(() => ({
	bitableCreateRecord: vi.fn(),
	bitableUpdateRecord: vi.fn(),
	readBitableRecords: vi.fn(),
	upsertBitableMirrorRecord: vi.fn()
}));

vi.mock('$platform/integrations/lark/bitable', () => ({
	bitableCreateRecord: mocks.bitableCreateRecord,
	bitableUpdateRecord: mocks.bitableUpdateRecord
}));

vi.mock('$platform/integrations/lark/bitable-read', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$platform/integrations/lark/bitable-read')>();
	return {
		...actual,
		readBitableRecords: mocks.readBitableRecords
	};
});

vi.mock('$platform/integrations/lark/bitable-sync', () => ({
	upsertBitableMirrorRecord: mocks.upsertBitableMirrorRecord
}));

describe('BitableCustomerRepository', () => {
	beforeEach(() => {
		mocks.bitableCreateRecord.mockReset();
		mocks.bitableUpdateRecord.mockReset();
		mocks.readBitableRecords.mockReset();
		mocks.upsertBitableMirrorRecord.mockReset();
	});

	it('resolves linked Contact Person records for customer directory output', async () => {
		mocks.readBitableRecords.mockImplementation(async (_db: unknown, tableId: string) => {
			if (tableId === 'bp_table') {
				return [
					{
						recordId: 'rec_bp_1',
						fields: {
							Name: 'Acme Pte Ltd',
							Type: 'Customer',
							Address: 'Singapore',
							'Contact Person': [{ record_id: 'rec_contact_1' }],
							Phone: { full_phone_number: '+65 6000 0000' }
						}
					}
				];
			}
			if (tableId === 'contact_table') {
				return [
					{
						recordId: 'rec_contact_1',
						fields: {
							'Contact Name': 'Alice Tan',
							Position: 'Purchasing Manager',
							Phone: { full_phone_number: '+65 9123 4567' },
							'Personal Email': 'alice@example.com',
							Is_main_contact: true
						}
					}
				];
			}
			return [];
		});

		const repo = new BitableCustomerRepository({} as never, 'bp_table', 'contact_table');
		const directory = await repo.listDirectory();
		const customer = await repo.findById('rec_bp_1');
		const metadata = JSON.parse(customer?.metadata ?? '{}') as Record<string, unknown>;

		expect(directory).toEqual([
			{
				id: 'rec_bp_1',
				name: 'Acme Pte Ltd',
				contact:
					'Alice Tan / Purchasing Manager / phone: +65 9123 4567 / email: alice@example.com',
				address: 'Singapore'
			}
		]);
		expect(metadata.contactPersonRecordIds).toEqual(['rec_contact_1']);
		expect(metadata.contactPersons).toEqual([
			{
				id: 'rec_contact_1',
				name: 'Alice Tan',
				position: 'Purchasing Manager',
				phone: '+65 9123 4567',
				email: 'alice@example.com',
				isMainContact: true
			}
		]);
	});

	it('creates Business Partner records through Lark and mirrors the returned record', async () => {
		mocks.bitableCreateRecord.mockResolvedValue({
			record_id: 'rec_bp_created',
			fields: { Name: 'New Customer', Type: 'Customer', Currency: 'SGD' }
		});

		const repo = new BitableCustomerRepository(
			{} as never,
			'bp_table',
			'contact_table',
			{} as Env,
			'app_token'
		);
		const result = await repo.create({
			name: 'New Customer',
			contact: '+65 9000 0000'
		});

		expect(result).toEqual({ id: 'rec_bp_created' });
		expect(mocks.bitableCreateRecord).toHaveBeenCalledWith(
			{},
			{
				appToken: 'app_token',
				tableId: 'bp_table',
				fields: {
					Name: 'New Customer',
					Type: 'Customer',
					Phone: '+65 9000 0000',
					Currency: 'SGD'
				}
			}
		);
		expect(mocks.upsertBitableMirrorRecord).toHaveBeenCalledWith(
			{},
			{
				appToken: 'app_token',
				tableId: 'bp_table',
				tableName: 'Business Partner',
				record: {
					record_id: 'rec_bp_created',
					fields: { Name: 'New Customer', Type: 'Customer', Currency: 'SGD' }
				}
			}
		);
	});

	it('creates linked Contact Person records and links them back to Business Partner', async () => {
		mocks.bitableCreateRecord
			.mockResolvedValueOnce({
				record_id: 'rec_bp_created',
				fields: { Name: 'New Customer', Type: 'Customer', Currency: 'SGD' }
			})
			.mockResolvedValueOnce({
				record_id: 'rec_contact_created',
				fields: {
					'Contact Name': 'Alice Tan',
					'Affiliated Unit': ['rec_bp_created'],
					Position: 'Purchasing Manager',
					Phone: '+65 9123 4567',
					'Personal Email': 'alice@example.com',
					Is_main_contact: true
				}
			});
		mocks.bitableUpdateRecord.mockResolvedValue({
			record_id: 'rec_bp_created',
			fields: {
				Name: 'New Customer',
				Type: 'Customer',
				Currency: 'SGD',
				'Contact Person': ['rec_contact_created']
			}
		});

		const repo = new BitableCustomerRepository(
			{} as never,
			'bp_table',
			'contact_table',
			{} as Env,
			'app_token'
		);
		const result = await repo.create({
			name: 'New Customer',
			contactName: 'Alice Tan',
			contactPosition: 'Purchasing Manager',
			contactPhone: '+65 9123 4567',
			contactEmail: 'alice@example.com'
		});

		expect(result).toEqual({ id: 'rec_bp_created' });
		expect(mocks.bitableCreateRecord).toHaveBeenNthCalledWith(
			1,
			{},
			{
				appToken: 'app_token',
				tableId: 'bp_table',
				fields: {
					Name: 'New Customer',
					Type: 'Customer',
					Email: 'alice@example.com',
					Phone: '+65 9123 4567',
					Currency: 'SGD'
				}
			}
		);
		expect(mocks.bitableCreateRecord).toHaveBeenNthCalledWith(
			2,
			{},
			{
				appToken: 'app_token',
				tableId: 'contact_table',
				fields: {
					'Contact Name': 'Alice Tan',
					'Affiliated Unit': ['rec_bp_created'],
					Position: 'Purchasing Manager',
					Phone: '+65 9123 4567',
					'Personal Email': 'alice@example.com',
					Is_main_contact: true
				}
			}
		);
		expect(mocks.bitableUpdateRecord).toHaveBeenCalledWith(
			{},
			{
				appToken: 'app_token',
				tableId: 'bp_table',
				recordId: 'rec_bp_created',
				fields: { 'Contact Person': ['rec_contact_created'] }
			}
		);
		expect(mocks.upsertBitableMirrorRecord).toHaveBeenCalledTimes(3);
		expect(mocks.upsertBitableMirrorRecord).toHaveBeenNthCalledWith(
			2,
			{},
			expect.objectContaining({
				tableId: 'contact_table',
				tableName: 'Contact Person',
				record: expect.objectContaining({ record_id: 'rec_contact_created' })
			})
		);
		expect(mocks.upsertBitableMirrorRecord).toHaveBeenNthCalledWith(
			3,
			{},
			expect.objectContaining({
				tableId: 'bp_table',
				tableName: 'Business Partner',
				record: expect.objectContaining({
					fields: expect.objectContaining({ 'Contact Person': ['rec_contact_created'] })
				})
			})
		);
	});
});
