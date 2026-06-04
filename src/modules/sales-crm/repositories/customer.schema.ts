import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { timeFields } from '$platform/modules/schema-helpers';
import { items } from '$modules/inventory/repositories/item.schema';

export const businessPartners = sqliteTable('business_partners', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	type: text('type', { enum: ['customer', 'supplier', 'both'] })
		.notNull()
		.default('customer'),
	registrationNo: text('registration_no'),
	country: text('country'),
	address: text('address'),
	contact: text('contact'),
	itemDescription: text('item_description'),
	dateCreate: text('date_create'),
	projectRelated: text('project_related'),
	currency: text('currency').default('SGD'),
	gstRegNo: text('gst_reg_no'),
	metadata: text('metadata'),
	...timeFields
});

export const partnerCustomerProfiles = sqliteTable('partner_customer_profiles', {
	id: text('id').primaryKey(),
	partnerId: text('partner_id')
		.notNull()
		.references(() => businessPartners.id),
	customerStatus: text('customer_status', {
		enum: ['active', 'on_hold', 'blacklisted']
	})
		.notNull()
		.default('active'),
	customerTier: text('customer_tier'),
	gstRegistrationStatus: text('gst_registration_status', {
		enum: ['registered', 'not_registered', 'exempt', 'unknown']
	})
		.notNull()
		.default('unknown'),
	taxCode: text('tax_code', { enum: ['SR', 'ZR', 'ES', 'OP'] }),
	billingAddress: text('billing_address'),
	shippingAddress: text('shipping_address'),
	billingTerms: text('billing_terms'),
	creditTerms: text('credit_terms'),
	// Stored as text (legacy column) but always holds a numeric string; parse with Number().
	creditLimit: text('credit_limit'),
	// Credit hold can be triggered manually or auto-set when an order would push
	// the customer over their credit limit (see SalesCrmService credit check).
	creditHoldFlag: integer('credit_hold_flag', { mode: 'boolean' }).notNull().default(false),
	creditHoldReason: text('credit_hold_reason'),
	preferredCurrency: text('preferred_currency').default('SGD'),
	...timeFields
});

export const partnerCustomerContacts = sqliteTable(
	'partner_customer_contacts',
	{
		id: text('id').primaryKey(),
		partnerId: text('partner_id')
			.notNull()
			.references(() => businessPartners.id),
		name: text('name').notNull(),
		phoneEmail: text('phone_email'),
		position: text('position'),
		isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
		notes: text('notes'),
		...timeFields
	},
	(table) => [index('idx_customer_contacts_partner').on(table.partnerId)]
);

export const partnerCustomerCommunications = sqliteTable(
	'partner_customer_communications',
	{
		id: text('id').primaryKey(),
		partnerId: text('partner_id')
			.notNull()
			.references(() => businessPartners.id),
		channel: text('channel', {
			enum: ['call', 'email', 'meeting', 'note', 'other']
		})
			.notNull()
			.default('note'),
		subject: text('subject').notNull(),
		body: text('body'),
		occurredAt: text('occurred_at').notNull(),
		contactName: text('contact_name'),
		loggedByUserId: text('logged_by_user_id'),
		loggedByEmail: text('logged_by_email'),
		...timeFields
	},
	(table) => [index('idx_customer_comms_partner').on(table.partnerId, table.occurredAt)]
);

export const partnerCustomerAttachments = sqliteTable(
	'partner_customer_attachments',
	{
		id: text('id').primaryKey(),
		partnerId: text('partner_id')
			.notNull()
			.references(() => businessPartners.id),
		attachmentType: text('attachment_type', {
			enum: ['contract', 'agreement', 'price_agreement', 'nda', 'other']
		})
			.notNull()
			.default('contract'),
		title: text('title').notNull(),
		fileName: text('file_name'),
		fileUrl: text('file_url'),
		expiryDate: text('expiry_date'),
		notes: text('notes'),
		...timeFields
	},
	(table) => [index('idx_customer_attachments_partner').on(table.partnerId)]
);

// Price agreements. partnerId null = a customer-group / global list keyed by
// `groupName`; partnerId set = a customer-specific list.
export const customerPriceLists = sqliteTable(
	'customer_price_lists',
	{
		id: text('id').primaryKey(),
		partnerId: text('partner_id').references(() => businessPartners.id),
		groupName: text('group_name'),
		name: text('name').notNull(),
		currency: text('currency').notNull().default('SGD'),
		status: text('status', { enum: ['draft', 'active', 'inactive'] })
			.notNull()
			.default('active'),
		validFrom: text('valid_from'),
		validTo: text('valid_to'),
		notes: text('notes'),
		...timeFields
	},
	(table) => [index('idx_customer_price_lists_partner').on(table.partnerId)]
);

export const customerPriceListItems = sqliteTable(
	'customer_price_list_items',
	{
		id: text('id').primaryKey(),
		priceListId: text('price_list_id')
			.notNull()
			.references(() => customerPriceLists.id),
		itemId: text('item_id').references(() => items.id),
		itemCode: text('item_code'),
		description: text('description').notNull(),
		uom: text('uom').notNull().default('unit'),
		unitPrice: real('unit_price').notNull().default(0),
		minQuantity: real('min_quantity').notNull().default(0),
		discountPct: real('discount_pct').notNull().default(0),
		...timeFields
	},
	(table) => [index('idx_customer_price_list_items_list').on(table.priceListId)]
);
