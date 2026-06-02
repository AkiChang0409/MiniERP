import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { DBClient } from '$infrastructure/db';
import { businessPartners } from '$modules/sales-crm/repositories/customer.schema';

const SUPPLIER_TYPES = ['supplier', 'both'] as const;

export class SupplierRepository {
	constructor(private db: DBClient) {}

	async findById(id: string) {
		const rows = await this.db
			.select()
			.from(businessPartners)
			.where(
				and(
					eq(businessPartners.id, id),
					inArray(businessPartners.type, SUPPLIER_TYPES),
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
			.where(
				and(
					or(eq(businessPartners.type, 'supplier'), eq(businessPartners.type, 'both'))!,
					isNull(businessPartners.deletedAt)
				)
			)
			.orderBy(desc(businessPartners.createdAt));
	}

	async create(data: Record<string, unknown>) {
		const now = new Date().toISOString();
		const id = (data.id as string) ?? crypto.randomUUID();
		const row = {
			...data,
			id,
			type: 'supplier',
			createdAt: now,
			updatedAt: now
		};
		await this.db.insert(businessPartners).values(row as any);
		return row;
	}

	async update(id: string, data: Record<string, unknown>) {
		const now = new Date().toISOString();
		await this.db
			.update(businessPartners)
			.set({ ...data, updatedAt: now } as any)
			.where(and(eq(businessPartners.id, id), inArray(businessPartners.type, SUPPLIER_TYPES), isNull(businessPartners.deletedAt)));
	}

	async softDelete(id: string) {
		const now = new Date().toISOString();
		await this.db
			.update(businessPartners)
			.set({ deletedAt: now, updatedAt: now })
			.where(and(eq(businessPartners.id, id), inArray(businessPartners.type, SUPPLIER_TYPES)));
	}
}
