import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { DBClient } from '$infrastructure/db';
import {
	inventoryItemAttachments,
	inventoryItemBarcodes,
	items
} from './repositories/item.schema';

export class ItemRepository {
	constructor(private db: DBClient) {}

	async findById(id: string) {
		const rows = await this.db
			.select()
			.from(items)
			.where(and(eq(items.id, id), isNull(items.deletedAt)))
			.limit(1);
		return rows[0] ?? null;
	}

	async findByCode(code: string) {
		const rows = await this.db
			.select()
			.from(items)
			.where(and(eq(items.code, code), isNull(items.deletedAt)))
			.limit(1);
		return rows[0] ?? null;
	}

	async findAll() {
		return this.db
			.select()
			.from(items)
			.where(isNull(items.deletedAt))
			.orderBy(desc(items.createdAt));
	}

	async listAttachmentsByItemIds(itemIds: string[]) {
		if (itemIds.length === 0) return [];
		return this.db
			.select()
			.from(inventoryItemAttachments)
			.where(
				and(
					inArray(inventoryItemAttachments.itemId, itemIds),
					isNull(inventoryItemAttachments.deletedAt)
				)
			)
			.orderBy(desc(inventoryItemAttachments.createdAt));
	}

	async listBarcodesByItemIds(itemIds: string[]) {
		if (itemIds.length === 0) return [];
		return this.db
			.select()
			.from(inventoryItemBarcodes)
			.where(
				and(
					inArray(inventoryItemBarcodes.itemId, itemIds),
					isNull(inventoryItemBarcodes.deletedAt)
				)
			)
			.orderBy(desc(inventoryItemBarcodes.createdAt));
	}

	async findByBarcode(value: string) {
		const rows = await this.db
			.select()
			.from(inventoryItemBarcodes)
			.where(
				and(eq(inventoryItemBarcodes.barcodeValue, value), isNull(inventoryItemBarcodes.deletedAt))
			)
			.limit(1);
		return rows[0] ?? null;
	}

	async create(row: Record<string, unknown>) {
		await this.db.insert(items).values(row as any);
	}

	async update(id: string, row: Record<string, unknown>) {
		const now = new Date().toISOString();
		await this.db
			.update(items)
			.set({ ...row, updatedAt: now } as any)
			.where(and(eq(items.id, id), isNull(items.deletedAt)));
	}

	async softDelete(id: string) {
		const now = new Date().toISOString();
		await this.db
			.update(items)
			.set({ deletedAt: now, updatedAt: now })
			.where(and(eq(items.id, id), isNull(items.deletedAt)));
	}

	async addAttachment(row: Record<string, unknown>) {
		await this.db.insert(inventoryItemAttachments).values(row as any);
	}

	async deleteAttachmentsByItem(itemId: string) {
		const now = new Date().toISOString();
		await this.db
			.update(inventoryItemAttachments)
			.set({ deletedAt: now, updatedAt: now })
			.where(
				and(
					eq(inventoryItemAttachments.itemId, itemId),
					isNull(inventoryItemAttachments.deletedAt)
				)
			);
	}

	async addBarcode(row: Record<string, unknown>) {
		await this.db.insert(inventoryItemBarcodes).values(row as any);
	}

	async deleteBarcodesByItem(itemId: string) {
		const now = new Date().toISOString();
		await this.db
			.update(inventoryItemBarcodes)
			.set({ deletedAt: now, updatedAt: now })
			.where(
				and(eq(inventoryItemBarcodes.itemId, itemId), isNull(inventoryItemBarcodes.deletedAt))
			);
	}
}
