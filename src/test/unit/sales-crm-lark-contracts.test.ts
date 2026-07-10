import { describe, expect, it } from 'vitest';
import {
	encodeBusinessPartnerCreate,
	encodeContactPersonCreate
} from '$modules/sales-crm/lark-contracts';

describe('Sales CRM Lark contracts', () => {
	it('encodes customer create input into writable Business Partner fields', () => {
		expect(
			encodeBusinessPartnerCreate({
				name: 'Acme Pte Ltd',
				address: 'Singapore',
				contact: 'billing@acme.test',
				gstRegNo: 'M12345678X',
				metadata: JSON.stringify({
					country: 'Singapore',
					paymentTerms: 'Net 30d',
					remark: 'Priority customer'
				})
			})
		).toEqual({
			Name: 'Acme Pte Ltd',
			Type: 'Customer',
			Address: 'Singapore',
			'GST Registration No': 'M12345678X',
			Email: 'billing@acme.test',
			Currency: 'SGD',
			'Payment Terms': 'Net 30d',
			Country: 'Singapore',
			Remark: 'Priority customer'
		});
	});

	it('rejects invalid select options before calling Lark', () => {
		expect(() =>
			encodeBusinessPartnerCreate({
				name: 'Acme Pte Ltd',
				metadata: JSON.stringify({ currency: 'BTC' })
			})
		).toThrow(/Invalid Bitable select option/);
	});

	it('encodes linked Contact Person create payloads', () => {
		expect(
			encodeContactPersonCreate(
				{
					name: 'Acme Pte Ltd',
					contactName: 'Alice Tan',
					contactPosition: 'Purchasing Manager',
					contactPhone: '+65 9123 4567',
					contactEmail: 'alice@example.com'
				},
				'rec_bp_1'
			)
		).toEqual({
			'Contact Name': 'Alice Tan',
			'Affiliated Unit': ['rec_bp_1'],
			Position: 'Purchasing Manager',
			Phone: '+65 9123 4567',
			'Personal Email': 'alice@example.com',
			Is_main_contact: true
		});
	});
});
