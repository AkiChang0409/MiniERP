import { describe, expect, it } from 'vitest';
import {
	assertBitableSelectOption,
	bitableCheckbox,
	bitableLinkedRecordIds,
	bitableNumber,
	bitablePhoneText,
	bitablePlainText,
	omitReadonlyBitableFields
} from '$platform/integrations/lark/bitable-field-codec';

describe('bitable field codecs', () => {
	it('extracts plain text from primitive, rich text, and select-like values', () => {
		expect(bitablePlainText(' Acme ')).toBe('Acme');
		expect(bitablePlainText([{ text: 'Acme' }, { text: 'Pte Ltd' }])).toBe('Acme, Pte Ltd');
		expect(bitablePlainText({ name: 'Customer' })).toBe('Customer');
	});

	it('extracts linked record ids from common relation shapes', () => {
		expect(
			bitableLinkedRecordIds([
				{ record_id: 'rec_a' },
				{ recordId: 'rec_b' },
				'rec_a',
				{ ids: ['rec_c'] }
			])
		).toEqual(['rec_a', 'rec_b', 'rec_c']);
	});

	it('normalizes checkbox, number, and phone values', () => {
		expect(bitableCheckbox('checked')).toBe(true);
		expect(bitableCheckbox('0')).toBe(false);
		expect(bitableNumber('1,234.50')).toBe(1234.5);
		expect(bitablePhoneText({ full_phone_number: '+65 9123 4567' })).toBe('+65 9123 4567');
	});

	it('rejects invalid select options before writing to Lark', () => {
		expect(() =>
			assertBitableSelectOption({ field: 'Type', options: ['Customer', 'Supplier', 'Both'] }, 'Partner')
		).toThrow(/Invalid Bitable select option/);
	});

	it('omits readonly fields from write payloads', () => {
		expect(
			omitReadonlyBitableFields(
				{ Name: 'Acme', No: 'BP-001', 'Email Domain': 'acme.test' },
				new Set(['No', 'Email Domain'])
			)
		).toEqual({ Name: 'Acme' });
	});
});
