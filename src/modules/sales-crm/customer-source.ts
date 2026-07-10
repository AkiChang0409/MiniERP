/**
 * Customer data source abstraction (B5 — Bitable-as-source-of-truth).
 *
 * The sales-crm service reads customers through this interface. App wiring uses
 * `BitableCustomerRepository` because Lark Base is the source of truth; the
 * legacy D1 repository remains only for migration/test seams until D1 is rebuilt
 * as backup/projection storage.
 */
import type { DBClient } from '$infrastructure/db';
import { bitableCreateRecord, bitableUpdateRecord } from '$platform/integrations/lark/bitable';
import { readBitableRecords, bitableText } from '$platform/integrations/lark/bitable-read';
import { upsertBitableMirrorRecord } from '$platform/integrations/lark/bitable-sync';
import { recordLarkWriteOperation } from '$platform/integrations/lark/bitable-write-log';
import {
	bitableCheckbox,
	bitableLinkedRecordIds,
	bitablePhoneText
} from '$platform/integrations/lark/bitable-field-codec';
import type { businessPartners } from './repositories/customer.schema';
import {
	BUSINESS_PARTNER_TABLE,
	CONTACT_PERSON_TABLE,
	encodeBusinessPartnerCreate,
	encodeContactPersonCreate
} from './lark-contracts';

export type CustomerRow = typeof businessPartners.$inferSelect;
export interface CustomerOption {
	id: string;
	name: string;
}
export interface CustomerDirectoryEntry {
	id: string;
	name: string;
	contact: string | null;
	address: string | null;
}

export interface CustomerCreateInput {
	id?: string;
	name: string;
	address?: string | null;
	contact?: string | null;
	contactName?: string | null;
	contactPosition?: string | null;
	contactPhone?: string | null;
	contactEmail?: string | null;
	isMainContact?: boolean | null;
	gstRegNo?: string | null;
	metadata?: string | null;
}

export interface CustomerSource {
	findById(id: string): Promise<CustomerRow | null>;
	findAll(): Promise<CustomerRow[]>;
	listOptions(): Promise<CustomerOption[]>;
	listDirectory(): Promise<CustomerDirectoryEntry[]>;
	create(data: CustomerCreateInput): Promise<{ id: string }>;
	softDelete(id: string): Promise<void>;
}

const CUSTOMER_TYPES = new Set<CustomerRow['type']>(['customer', 'both']);

interface ContactPersonProjection {
	id: string;
	name: string | null;
	position: string | null;
	phone: string | null;
	email: string | null;
	isMainContact: boolean | null;
}

type ContactPersonLookup = Map<string, ContactPersonProjection>;

function normalizeType(value: unknown): CustomerRow['type'] {
	const s = (bitableText(value) ?? '').toLowerCase();
	if (s.startsWith('supplier')) return 'supplier';
	if (s.startsWith('both')) return 'both';
	return 'customer';
}

function mapContactPerson(recordId: string, f: Record<string, unknown>): ContactPersonProjection {
	return {
		id: recordId,
		name: bitableText(f['Contact Name']),
		position: bitableText(f['Position']),
		phone: bitablePhoneText(f['Phone']),
		email: bitableText(f['Personal Email']),
		isMainContact: bitableCheckbox(f['Is_main_contact'])
	};
}

function contactDisplayName(contact: ContactPersonProjection): string | null {
	const parts = [
		contact.name,
		contact.position ? `${contact.position}` : null,
		contact.phone ? `phone: ${contact.phone}` : null,
		contact.email ? `email: ${contact.email}` : null
	].filter((part): part is string => Boolean(part));
	return parts.join(' / ') || null;
}

function resolveLinkedContacts(
	contactPersonRecordIds: string[],
	contacts: ContactPersonLookup
): ContactPersonProjection[] {
	return contactPersonRecordIds
		.map((id) => contacts.get(id))
		.filter((contact): contact is ContactPersonProjection => Boolean(contact))
		.sort((a, b) => Number(b.isMainContact === true) - Number(a.isMainContact === true));
}

/** Map one Bitable Business Partner record to the `business_partners` row shape. */
function mapBusinessPartner(
	recordId: string,
	f: Record<string, unknown>,
	contacts: ContactPersonLookup = new Map()
): CustomerRow {
	const now = '';
	const contactPersonRecordIds = bitableLinkedRecordIds(f['Contact Person']);
	const contactPersons = resolveLinkedContacts(contactPersonRecordIds, contacts);
	const linkedContactText = contactPersons.map(contactDisplayName).filter(Boolean).join('; ');
	const contact =
		linkedContactText || (contactPersonRecordIds.length > 0 ? null : bitableText(f['Contact Person']));
	return {
		id: recordId,
		name: bitableText(f['Name']) ?? '(unnamed)',
		type: normalizeType(f['Type']),
		registrationNo: bitableText(f['Registration No']),
		country: bitableText(f['Country']),
		address: bitableText(f['Address']),
		contact,
		itemDescription: bitableText(f['Item Description']),
		dateCreate: null,
		projectRelated: null,
		currency: bitableText(f['Currency']) ?? 'SGD',
		gstRegNo: bitableText(f['GST Registration No']),
		metadata: JSON.stringify({
			no: bitableText(f['No']),
			email: bitableText(f['Email']),
			phone: bitablePhoneText(f['Phone']),
			credit: bitableText(f['Credit']),
			paymentTerms: bitableText(f['Payment Terms']),
			contactPersonRecordIds,
			contactPersons,
			remark: bitableText(f['Remark'])
		}),
		createdAt: now,
		updatedAt: now,
		deletedAt: null
	};
}

export class BitableCustomerRepository implements CustomerSource {
	constructor(
		private db: DBClient,
		private tableId: string,
		private contactTableId?: string,
		private env?: Env,
		private appToken?: string
	) {}

	private async contactLookup(): Promise<ContactPersonLookup> {
		if (!this.contactTableId) return new Map();
		const rows = await readBitableRecords(this.db, this.contactTableId);
		return new Map(rows.map((row) => [row.recordId, mapContactPerson(row.recordId, row.fields)]));
	}

	private async all(): Promise<CustomerRow[]> {
		const [records, contacts] = await Promise.all([
			readBitableRecords(this.db, this.tableId),
			this.contactLookup()
		]);
		return records
			.map((r) => mapBusinessPartner(r.recordId, r.fields, contacts))
			.filter((c) => CUSTOMER_TYPES.has(c.type))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	async findAll(): Promise<CustomerRow[]> {
		return this.all();
	}

	async findById(id: string): Promise<CustomerRow | null> {
		return (await this.all()).find((c) => c.id === id) ?? null;
	}

	async listOptions(): Promise<CustomerOption[]> {
		return (await this.all()).map((c) => ({ id: c.id, name: c.name }));
	}

	async listDirectory(): Promise<CustomerDirectoryEntry[]> {
		return (await this.all()).map((c) => ({
			id: c.id,
			name: c.name,
			contact: c.contact,
			address: c.address
		}));
	}

	async create(data: CustomerCreateInput): Promise<{ id: string }> {
		if (!this.env || !this.appToken) {
			throw new Error('Sales CRM Lark write-through requires env and app token');
		}
		const businessPartnerFields = encodeBusinessPartnerCreate(data);
		const record = await bitableCreateRecord(this.env, {
			appToken: this.appToken,
			tableId: this.tableId,
			fields: businessPartnerFields
		});
		await recordLarkWriteOperation(this.db, {
			appToken: this.appToken,
			tableId: this.tableId,
			tableName: BUSINESS_PARTNER_TABLE.name,
			recordId: record.record_id,
			operation: 'create_record',
			status: 'success',
			payload: { fields: businessPartnerFields },
			result: record,
			sourceModule: 'sales-crm',
			sourceAction: 'createCustomer'
		});
		await upsertBitableMirrorRecord(this.db, {
			appToken: this.appToken,
			tableId: this.tableId,
			tableName: BUSINESS_PARTNER_TABLE.name,
			record
		});

		if (data.contactName?.trim()) {
			if (!this.contactTableId) {
				throw new Error('LARK_BP_CONTACT_TABLE_ID is required to create linked Contact Person records');
			}
			const contactFields = encodeContactPersonCreate(data, record.record_id);
			const contactRecord = await bitableCreateRecord(this.env, {
				appToken: this.appToken,
				tableId: this.contactTableId,
				fields: contactFields
			});
			await recordLarkWriteOperation(this.db, {
				appToken: this.appToken,
				tableId: this.contactTableId,
				tableName: CONTACT_PERSON_TABLE.name,
				recordId: contactRecord.record_id,
				operation: 'create_record',
				status: 'success',
				payload: { fields: contactFields },
				result: contactRecord,
				sourceModule: 'sales-crm',
				sourceAction: 'createCustomer.contactPerson'
			});
			await upsertBitableMirrorRecord(this.db, {
				appToken: this.appToken,
				tableId: this.contactTableId,
				tableName: CONTACT_PERSON_TABLE.name,
				record: contactRecord
			});

			const updatedBusinessPartner = await bitableUpdateRecord(this.env, {
				appToken: this.appToken,
				tableId: this.tableId,
				recordId: record.record_id,
				fields: { [BUSINESS_PARTNER_TABLE.fields.contactPerson]: [contactRecord.record_id] }
			});
			await recordLarkWriteOperation(this.db, {
				appToken: this.appToken,
				tableId: this.tableId,
				tableName: BUSINESS_PARTNER_TABLE.name,
				recordId: record.record_id,
				operation: 'update_record',
				status: 'success',
				payload: { fields: { [BUSINESS_PARTNER_TABLE.fields.contactPerson]: [contactRecord.record_id] } },
				result: updatedBusinessPartner,
				sourceModule: 'sales-crm',
				sourceAction: 'createCustomer.linkContactPerson'
			});
			await upsertBitableMirrorRecord(this.db, {
				appToken: this.appToken,
				tableId: this.tableId,
				tableName: BUSINESS_PARTNER_TABLE.name,
				record: updatedBusinessPartner
			});
		}
		return { id: record.record_id };
	}

	async softDelete(): Promise<void> {
		throw new Error('Customer deletion must be implemented as Lark write-through with confirmation.');
	}
}
