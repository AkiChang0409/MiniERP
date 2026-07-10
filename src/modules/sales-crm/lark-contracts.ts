import {
	assertBitableSelectOption,
	omitReadonlyBitableFields,
	type BitableRawFields
} from '$platform/integrations/lark/bitable-field-codec';
import type { CustomerCreateInput } from './customer-source';

export const BUSINESS_PARTNER_TABLE = {
	name: 'Business Partner',
	fields: {
		name: 'Name',
		no: 'No',
		email: 'Email',
		emailDomain: 'Email Domain',
		phone: 'Phone',
		type: 'Type',
		registrationNo: 'Registration No',
		gstRegistrationNo: 'GST Registration No',
		country: 'Country',
		address: 'Address',
		currency: 'Currency',
		credit: 'Credit',
		paymentTerms: 'Payment Terms',
		itemDescription: 'Item Description',
		contactPerson: 'Contact Person',
		remark: 'Remark',
		projects: '🚩 Projects',
		docHub: 'Doc Hub'
	},
	readonlyFields: new Set(['No', 'Email Domain'])
} as const;

export const CONTACT_PERSON_TABLE = {
	name: 'Contact Person',
	fields: {
		name: 'Contact Name',
		id: 'ID',
		affiliatedUnit: 'Affiliated Unit',
		position: 'Position',
		phone: 'Phone',
		personalEmail: 'Personal Email',
		isMainContact: 'Is_main_contact'
	},
	readonlyFields: new Set(['ID'])
} as const;

const BUSINESS_PARTNER_TYPE_OPTIONS = ['Customer', 'Supplier', 'Both'] as const;
const CURRENCY_OPTIONS = ['SGD', 'CNY', 'HKD', 'USD', 'JPY', 'AUD', 'EUR', 'GBP', 'NZD', 'CAD'] as const;
const PAYMENT_TERMS_OPTIONS = ['Net 30d', 'Net 60d', 'Prepaid', 'Cash on delivery'] as const;

function parseMetadata(input: string | null | undefined): Record<string, unknown> {
	if (!input) return {};
	try {
		const parsed = JSON.parse(input) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function stringMeta(metadata: Record<string, unknown>, key: string): string | null {
	const value = metadata[key];
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function splitContact(contact: string | null | undefined): { email?: string; phone?: string } {
	const value = contact?.trim();
	if (!value) return {};
	if (value.includes('@')) return { email: value };
	return { phone: value };
}

function cleanWritableFields(fields: BitableRawFields, readonlyFields: ReadonlySet<string>): BitableRawFields {
	return Object.fromEntries(
		Object.entries(omitReadonlyBitableFields(fields, readonlyFields)).filter(
			([, value]) => value !== undefined && value !== null && value !== ''
		)
	);
}

export function encodeBusinessPartnerCreate(input: CustomerCreateInput): BitableRawFields {
	const metadata = parseMetadata(input.metadata);
	const contact = splitContact(input.contact);
	const currency = stringMeta(metadata, 'currency') ?? 'SGD';
	const paymentTerms = stringMeta(metadata, 'paymentTerms');

	assertBitableSelectOption(
		{ field: BUSINESS_PARTNER_TABLE.fields.type, options: BUSINESS_PARTNER_TYPE_OPTIONS },
		'Customer'
	);
	assertBitableSelectOption(
		{ field: BUSINESS_PARTNER_TABLE.fields.currency, options: CURRENCY_OPTIONS },
		currency
	);
	assertBitableSelectOption(
		{ field: BUSINESS_PARTNER_TABLE.fields.paymentTerms, options: PAYMENT_TERMS_OPTIONS },
		paymentTerms
	);

	const fields: BitableRawFields = {
		[BUSINESS_PARTNER_TABLE.fields.name]: input.name,
		[BUSINESS_PARTNER_TABLE.fields.type]: 'Customer',
		[BUSINESS_PARTNER_TABLE.fields.address]: input.address ?? undefined,
		[BUSINESS_PARTNER_TABLE.fields.gstRegistrationNo]: input.gstRegNo ?? undefined,
		[BUSINESS_PARTNER_TABLE.fields.email]:
			input.contactEmail ?? contact.email ?? stringMeta(metadata, 'email') ?? undefined,
		[BUSINESS_PARTNER_TABLE.fields.phone]:
			input.contactPhone ?? contact.phone ?? stringMeta(metadata, 'phone') ?? undefined,
		[BUSINESS_PARTNER_TABLE.fields.currency]: currency,
		[BUSINESS_PARTNER_TABLE.fields.paymentTerms]: paymentTerms ?? undefined,
		[BUSINESS_PARTNER_TABLE.fields.country]: stringMeta(metadata, 'country') ?? undefined,
		[BUSINESS_PARTNER_TABLE.fields.registrationNo]: stringMeta(metadata, 'registrationNo') ?? undefined,
		[BUSINESS_PARTNER_TABLE.fields.itemDescription]: stringMeta(metadata, 'itemDescription') ?? undefined,
		[BUSINESS_PARTNER_TABLE.fields.remark]: stringMeta(metadata, 'remark') ?? undefined
	};

	return cleanWritableFields(fields, BUSINESS_PARTNER_TABLE.readonlyFields);
}

export function encodeContactPersonCreate(
	input: CustomerCreateInput,
	businessPartnerRecordId: string
): BitableRawFields {
	const fields: BitableRawFields = {
		[CONTACT_PERSON_TABLE.fields.name]: input.contactName,
		[CONTACT_PERSON_TABLE.fields.affiliatedUnit]: [businessPartnerRecordId],
		[CONTACT_PERSON_TABLE.fields.position]: input.contactPosition ?? undefined,
		[CONTACT_PERSON_TABLE.fields.phone]: input.contactPhone ?? undefined,
		[CONTACT_PERSON_TABLE.fields.personalEmail]: input.contactEmail ?? undefined,
		[CONTACT_PERSON_TABLE.fields.isMainContact]: input.isMainContact ?? true
	};
	return cleanWritableFields(fields, CONTACT_PERSON_TABLE.readonlyFields);
}
