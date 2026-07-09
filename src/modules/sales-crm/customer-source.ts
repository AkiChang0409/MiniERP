/**
 * Customer data source abstraction (B5 — Bitable-as-source-of-truth).
 *
 * The sales-crm service reads customers through this interface, so the storage
 * backend can swap behind the `createSalesCrmApi` facade WITHOUT touching routes,
 * UI, or the sales-crm agent. Two impls:
 *   - `CustomerRepository` (repository.ts) — legacy D1 `business_partners`.
 *   - `BitableCustomerRepository` (below) — reads the Bitable mirror.
 * Which one is wired is decided in `api.ts` by the `LARK_BP_TABLE_ID` env toggle.
 */
import type { DBClient } from '$infrastructure/db';
import { readBitableRecords, bitableText } from '$platform/integrations/lark/bitable-read';
import type { businessPartners } from './repositories/customer.schema';

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

function normalizeType(value: unknown): CustomerRow['type'] {
	const s = (bitableText(value) ?? '').toLowerCase();
	if (s.startsWith('supplier')) return 'supplier';
	if (s.startsWith('both')) return 'both';
	return 'customer';
}

/** Map one Bitable Business Partner record to the `business_partners` row shape. */
function mapBusinessPartner(recordId: string, f: Record<string, unknown>): CustomerRow {
	const now = '';
	return {
		id: recordId,
		name: bitableText(f['Name']) ?? '(unnamed)',
		type: normalizeType(f['Type']),
		registrationNo: bitableText(f['Registration No']),
		country: bitableText(f['Country']),
		address: bitableText(f['Address']),
		contact: bitableText(f['Contact Person']),
		itemDescription: bitableText(f['Item Description']),
		dateCreate: null,
		projectRelated: null,
		currency: bitableText(f['Currency']) ?? 'SGD',
		gstRegNo: bitableText(f['GST Registration No']),
		metadata: JSON.stringify({
			no: bitableText(f['No']),
			email: bitableText(f['Email']),
			phone: bitableText(f['Phone']),
			credit: bitableText(f['Credit']),
			paymentTerms: bitableText(f['Payment Terms']),
			remark: bitableText(f['Remark'])
		}),
		createdAt: now,
		updatedAt: now,
		deletedAt: null
	};
}

const WRITE_MSG =
	'Customer master is managed in Lark Bitable now. MiniERP write-through lands in B4 — please edit in Lark for now.';

export class BitableCustomerRepository implements CustomerSource {
	constructor(
		private db: DBClient,
		private tableId: string
	) {}

	private async all(): Promise<CustomerRow[]> {
		const records = await readBitableRecords(this.db, this.tableId);
		return records
			.map((r) => mapBusinessPartner(r.recordId, r.fields))
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

	async create(): Promise<{ id: string }> {
		throw new Error(WRITE_MSG);
	}

	async softDelete(): Promise<void> {
		throw new Error(WRITE_MSG);
	}
}
