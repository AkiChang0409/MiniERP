import { desc, eq, isNull, and, inArray } from 'drizzle-orm';
import type { DBClient } from '$infrastructure/db';
import { businessPartners } from './repositories/customer.schema';

const CUSTOMER_TYPES = ['customer', 'both'] as const;

export class CustomerRepository {
	constructor(private db: DBClient) {}

	async findById(id: string) {
		const rows = await this.db
			.select()
			.from(businessPartners)
			.where(
				and(
					eq(businessPartners.id, id),
					inArray(businessPartners.type, CUSTOMER_TYPES),
					isNull(businessPartners.deletedAt)
				)
			)
			.limit(1);
		return rows[0] ?? null;
	}

	async findAll() {
		return this.db
			.select()
			.from(businessPartners)
			.where(and(inArray(businessPartners.type, CUSTOMER_TYPES), isNull(businessPartners.deletedAt)))
			.orderBy(desc(businessPartners.createdAt));
	}

	async listOptions() {
		return this.db
			.select({ id: businessPartners.id, name: businessPartners.name })
			.from(businessPartners)
			.where(and(inArray(businessPartners.type, CUSTOMER_TYPES), isNull(businessPartners.deletedAt)))
			.orderBy(desc(businessPartners.createdAt));
	}

	async listDirectory() {
		return this.db
			.select({
				id: businessPartners.id,
				name: businessPartners.name,
				contact: businessPartners.contact,
				address: businessPartners.address
			})
			.from(businessPartners)
			.where(and(inArray(businessPartners.type, CUSTOMER_TYPES), isNull(businessPartners.deletedAt)))
			.orderBy(desc(businessPartners.createdAt));
	}

	async create(data: {
		id?: string;
		name: string;
		address?: string | null;
		contact?: string | null;
		gstRegNo?: string | null;
		metadata?: string | null;
	}) {
		const id = data.id ?? crypto.randomUUID();
		const now = new Date().toISOString();
		await this.db.insert(businessPartners).values({
			id,
			name: data.name,
			type: 'customer',
			address: data.address ?? null,
			contact: data.contact ?? null,
			gstRegNo: data.gstRegNo ?? null,
			metadata: data.metadata ?? null,
			createdAt: now,
			updatedAt: now
		});
		return { id };
	}

	async softDelete(id: string) {
		const now = new Date().toISOString();
		await this.db
			.update(businessPartners)
			.set({ deletedAt: now, updatedAt: now })
			.where(and(eq(businessPartners.id, id), inArray(businessPartners.type, CUSTOMER_TYPES)));
	}
}
