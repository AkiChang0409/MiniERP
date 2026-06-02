import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DBClient } from '$infrastructure/db';
import {
	inventoryCycleCountLines,
	inventoryCycleCounts,
	inventoryStockLevels,
	inventoryStockMovements,
	inventoryStockTransferLines,
	inventoryStockTransfers,
	warehouseBinLocations,
	warehouses
} from './repositories/warehouse.schema';
import { items } from './repositories/item.schema';

export class WarehouseRepository {
	constructor(private db: DBClient) {}

	// ----------------- warehouses -----------------

	async findWarehouseById(id: string) {
		const rows = await this.db
			.select()
			.from(warehouses)
			.where(and(eq(warehouses.id, id), isNull(warehouses.deletedAt)))
			.limit(1);
		return rows[0] ?? null;
	}

	async findWarehouseByCode(code: string) {
		const rows = await this.db
			.select()
			.from(warehouses)
			.where(and(eq(warehouses.code, code), isNull(warehouses.deletedAt)))
			.limit(1);
		return rows[0] ?? null;
	}

	async findAllWarehouses() {
		return this.db
			.select()
			.from(warehouses)
			.where(isNull(warehouses.deletedAt))
			.orderBy(warehouses.code);
	}

	async createWarehouse(row: Record<string, unknown>) {
		await this.db.insert(warehouses).values(row as any);
	}

	async updateWarehouse(id: string, row: Record<string, unknown>) {
		const now = new Date().toISOString();
		await this.db
			.update(warehouses)
			.set({ ...row, updatedAt: now } as any)
			.where(and(eq(warehouses.id, id), isNull(warehouses.deletedAt)));
	}

	async softDeleteWarehouse(id: string) {
		const now = new Date().toISOString();
		await this.db
			.update(warehouses)
			.set({ deletedAt: now, updatedAt: now })
			.where(and(eq(warehouses.id, id), isNull(warehouses.deletedAt)));
	}

	// ----------------- bins -----------------

	async findBinById(id: string) {
		const rows = await this.db
			.select()
			.from(warehouseBinLocations)
			.where(and(eq(warehouseBinLocations.id, id), isNull(warehouseBinLocations.deletedAt)))
			.limit(1);
		return rows[0] ?? null;
	}

	async findBinByBarcode(value: string) {
		const rows = await this.db
			.select()
			.from(warehouseBinLocations)
			.where(
				and(eq(warehouseBinLocations.barcode, value), isNull(warehouseBinLocations.deletedAt))
			)
			.limit(1);
		return rows[0] ?? null;
	}

	async findBinsByWarehouse(warehouseId: string) {
		return this.db
			.select()
			.from(warehouseBinLocations)
			.where(
				and(
					eq(warehouseBinLocations.warehouseId, warehouseId),
					isNull(warehouseBinLocations.deletedAt)
				)
			)
			.orderBy(warehouseBinLocations.code);
	}

	async findBinsByWarehouses(warehouseIds: string[]) {
		if (warehouseIds.length === 0) return [];
		return this.db
			.select()
			.from(warehouseBinLocations)
			.where(
				and(
					inArray(warehouseBinLocations.warehouseId, warehouseIds),
					isNull(warehouseBinLocations.deletedAt)
				)
			)
			.orderBy(warehouseBinLocations.code);
	}

	async createBin(row: Record<string, unknown>) {
		await this.db.insert(warehouseBinLocations).values(row as any);
	}

	async updateBin(id: string, row: Record<string, unknown>) {
		const now = new Date().toISOString();
		await this.db
			.update(warehouseBinLocations)
			.set({ ...row, updatedAt: now } as any)
			.where(and(eq(warehouseBinLocations.id, id), isNull(warehouseBinLocations.deletedAt)));
	}

	async softDeleteBin(id: string) {
		const now = new Date().toISOString();
		await this.db
			.update(warehouseBinLocations)
			.set({ deletedAt: now, updatedAt: now })
			.where(and(eq(warehouseBinLocations.id, id), isNull(warehouseBinLocations.deletedAt)));
	}

	// ----------------- stock levels -----------------

	async findStockLevel(itemId: string, warehouseId: string, binLocationId: string) {
		const rows = await this.db
			.select()
			.from(inventoryStockLevels)
			.where(
				and(
					eq(inventoryStockLevels.itemId, itemId),
					eq(inventoryStockLevels.warehouseId, warehouseId),
					eq(inventoryStockLevels.binLocationId, binLocationId),
					isNull(inventoryStockLevels.deletedAt)
				)
			)
			.limit(1);
		return rows[0] ?? null;
	}

	async listStockLevels(filters: { itemId?: string; warehouseId?: string; binLocationId?: string }) {
		const clauses: any[] = [isNull(inventoryStockLevels.deletedAt)];
		if (filters.itemId) clauses.push(eq(inventoryStockLevels.itemId, filters.itemId));
		if (filters.warehouseId) clauses.push(eq(inventoryStockLevels.warehouseId, filters.warehouseId));
		if (filters.binLocationId)
			clauses.push(eq(inventoryStockLevels.binLocationId, filters.binLocationId));
		return this.db
			.select({
				level: inventoryStockLevels,
				item: items,
				warehouse: warehouses,
				bin: warehouseBinLocations
			})
			.from(inventoryStockLevels)
			.innerJoin(items, eq(items.id, inventoryStockLevels.itemId))
			.innerJoin(warehouses, eq(warehouses.id, inventoryStockLevels.warehouseId))
			.innerJoin(
				warehouseBinLocations,
				eq(warehouseBinLocations.id, inventoryStockLevels.binLocationId)
			)
			.where(and(...clauses))
			.orderBy(items.code, warehouses.code, warehouseBinLocations.code);
	}

	async insertStockLevel(row: Record<string, unknown>) {
		await this.db.insert(inventoryStockLevels).values(row as any);
	}

	async updateStockLevelQty(
		id: string,
		quantityOnHand: number,
		lastMovementAt: string,
		unitCost?: number | null
	) {
		const now = new Date().toISOString();
		const set: Record<string, unknown> = {
			quantityOnHand,
			lastMovementAt,
			updatedAt: now
		};
		if (unitCost !== undefined) set.unitCost = unitCost;
		await this.db
			.update(inventoryStockLevels)
			.set(set as any)
			.where(eq(inventoryStockLevels.id, id));
	}

	// ----------------- movements -----------------

	async insertMovement(row: Record<string, unknown>) {
		await this.db.insert(inventoryStockMovements).values(row as any);
	}

	async listMovementsForItem(itemId: string, limit = 50) {
		return this.db
			.select({
				movement: inventoryStockMovements,
				warehouse: warehouses,
				bin: warehouseBinLocations
			})
			.from(inventoryStockMovements)
			.innerJoin(warehouses, eq(warehouses.id, inventoryStockMovements.warehouseId))
			.innerJoin(
				warehouseBinLocations,
				eq(warehouseBinLocations.id, inventoryStockMovements.binLocationId)
			)
			.where(eq(inventoryStockMovements.itemId, itemId))
			.orderBy(desc(inventoryStockMovements.createdAt))
			.limit(limit);
	}

	// ----------------- transfers -----------------

	async findTransferById(id: string) {
		const rows = await this.db
			.select()
			.from(inventoryStockTransfers)
			.where(and(eq(inventoryStockTransfers.id, id), isNull(inventoryStockTransfers.deletedAt)))
			.limit(1);
		return rows[0] ?? null;
	}

	async listTransfers() {
		return this.db
			.select()
			.from(inventoryStockTransfers)
			.where(isNull(inventoryStockTransfers.deletedAt))
			.orderBy(desc(inventoryStockTransfers.createdAt));
	}

	/** Read transfer lines without joins; service hydrates bins / items by id. */
	async listTransferLinesRaw(transferId: string) {
		return this.db
			.select()
			.from(inventoryStockTransferLines)
			.where(
				and(
					eq(inventoryStockTransferLines.transferId, transferId),
					isNull(inventoryStockTransferLines.deletedAt)
				)
			)
			.orderBy(inventoryStockTransferLines.createdAt);
	}

	async insertTransfer(row: Record<string, unknown>) {
		await this.db.insert(inventoryStockTransfers).values(row as any);
	}

	async updateTransfer(id: string, row: Record<string, unknown>) {
		const now = new Date().toISOString();
		await this.db
			.update(inventoryStockTransfers)
			.set({ ...row, updatedAt: now } as any)
			.where(eq(inventoryStockTransfers.id, id));
	}

	async insertTransferLine(row: Record<string, unknown>) {
		await this.db.insert(inventoryStockTransferLines).values(row as any);
	}

	async updateTransferLine(id: string, row: Record<string, unknown>) {
		const now = new Date().toISOString();
		await this.db
			.update(inventoryStockTransferLines)
			.set({ ...row, updatedAt: now } as any)
			.where(eq(inventoryStockTransferLines.id, id));
	}

	async nextTransferNumberCount() {
		const result = await this.db
			.select({ n: sql<number>`count(*)` })
			.from(inventoryStockTransfers);
		return Number(result[0]?.n ?? 0);
	}

	// ----------------- movement listing (audit trail / aging) -----------------

	async listMovements(filters: {
		itemId?: string;
		warehouseId?: string;
		movementType?: string;
		alertCode?: string;
		limit?: number;
	}) {
		const clauses: any[] = [];
		if (filters.itemId) clauses.push(eq(inventoryStockMovements.itemId, filters.itemId));
		if (filters.warehouseId)
			clauses.push(eq(inventoryStockMovements.warehouseId, filters.warehouseId));
		if (filters.movementType)
			clauses.push(eq(inventoryStockMovements.movementType, filters.movementType as any));
		if (filters.alertCode)
			clauses.push(eq(inventoryStockMovements.iaAlertCode, filters.alertCode));
		const where = clauses.length > 0 ? and(...clauses) : undefined;
		const limit = filters.limit ?? 200;
		return this.db
			.select({
				movement: inventoryStockMovements,
				item: items,
				warehouse: warehouses,
				bin: warehouseBinLocations
			})
			.from(inventoryStockMovements)
			.innerJoin(items, eq(items.id, inventoryStockMovements.itemId))
			.innerJoin(warehouses, eq(warehouses.id, inventoryStockMovements.warehouseId))
			.innerJoin(
				warehouseBinLocations,
				eq(warehouseBinLocations.id, inventoryStockMovements.binLocationId)
			)
			.where(where as any)
			.orderBy(desc(inventoryStockMovements.createdAt))
			.limit(limit);
	}

	/** Used by aging: returns lean rows sorted by createdAt ASC for FIFO walk. */
	async listMovementsForAging(filters: { warehouseId?: string }) {
		const clauses: any[] = [];
		if (filters.warehouseId)
			clauses.push(eq(inventoryStockMovements.warehouseId, filters.warehouseId));
		const where = clauses.length > 0 ? and(...clauses) : undefined;
		return this.db
			.select({
				itemId: inventoryStockMovements.itemId,
				warehouseId: inventoryStockMovements.warehouseId,
				binLocationId: inventoryStockMovements.binLocationId,
				quantityDelta: inventoryStockMovements.quantityDelta,
				unitCost: inventoryStockMovements.unitCost,
				createdAt: inventoryStockMovements.createdAt
			})
			.from(inventoryStockMovements)
			.where(where as any)
			.orderBy(inventoryStockMovements.createdAt);
	}

	// ----------------- cycle counts -----------------

	async findCycleCountById(id: string) {
		const rows = await this.db
			.select()
			.from(inventoryCycleCounts)
			.where(and(eq(inventoryCycleCounts.id, id), isNull(inventoryCycleCounts.deletedAt)))
			.limit(1);
		return rows[0] ?? null;
	}

	async listCycleCounts() {
		return this.db
			.select()
			.from(inventoryCycleCounts)
			.where(isNull(inventoryCycleCounts.deletedAt))
			.orderBy(desc(inventoryCycleCounts.createdAt));
	}

	async listCycleCountLines(cycleCountId: string) {
		return this.db
			.select()
			.from(inventoryCycleCountLines)
			.where(
				and(
					eq(inventoryCycleCountLines.cycleCountId, cycleCountId),
					isNull(inventoryCycleCountLines.deletedAt)
				)
			)
			.orderBy(inventoryCycleCountLines.createdAt);
	}

	async insertCycleCount(row: Record<string, unknown>) {
		await this.db.insert(inventoryCycleCounts).values(row as any);
	}

	async insertCycleCountLine(row: Record<string, unknown>) {
		await this.db.insert(inventoryCycleCountLines).values(row as any);
	}

	async updateCycleCount(id: string, row: Record<string, unknown>) {
		const now = new Date().toISOString();
		await this.db
			.update(inventoryCycleCounts)
			.set({ ...row, updatedAt: now } as any)
			.where(eq(inventoryCycleCounts.id, id));
	}

	async updateCycleCountLine(id: string, row: Record<string, unknown>) {
		const now = new Date().toISOString();
		await this.db
			.update(inventoryCycleCountLines)
			.set({ ...row, updatedAt: now } as any)
			.where(eq(inventoryCycleCountLines.id, id));
	}

	async nextCycleCountNumberCount() {
		const result = await this.db
			.select({ n: sql<number>`count(*)` })
			.from(inventoryCycleCounts);
		return Number(result[0]?.n ?? 0);
	}
}
