import type { ModuleContext } from '$platform/modules/types';
import { ConflictError, NotFoundError, ValidationError } from '$platform/modules/errors';
import { AuditService } from '$platform/audit/audit-service';
import { WarehouseRepository } from './warehouse-repository';
import { ItemRepository } from './repository';

export type WarehouseStatus = 'active' | 'inactive';

export type BinLocationType =
	| 'raw_material'
	| 'wip'
	| 'finished_goods'
	| 'quarantine'
	| 'picking'
	| 'shipping'
	| 'staging'
	| 'general';

export type TransferStatus = 'draft' | 'in_transit' | 'completed' | 'cancelled';

export type MovementType =
	| 'opening_balance'
	| 'receipt'
	| 'issue'
	| 'transfer_out'
	| 'transfer_in'
	| 'adjustment'
	| 'scrap'
	| 'cycle_count';

/** Threshold (SGD) above which an unverified adjustment triggers IA002. */
export const IA002_VALUE_THRESHOLD = 10_000;

export type WarehouseInput = {
	code: string;
	name: string;
	status?: WarehouseStatus;
	addressLine1?: string;
	addressLine2?: string;
	city?: string;
	state?: string;
	postalCode?: string;
	country?: string;
	contactName?: string;
	contactPhone?: string;
	contactEmail?: string;
	notes?: string;
};

export type BinInput = {
	warehouseId: string;
	code: string;
	name?: string;
	locationType?: BinLocationType;
	aisle?: string;
	rack?: string;
	shelf?: string;
	bin?: string;
	barcode?: string;
	isPickable?: boolean;
	isReceivable?: boolean;
	isDefaultPutaway?: boolean;
	status?: WarehouseStatus;
	notes?: string;
};

export type StockAdjustmentInput = {
	itemId: string;
	warehouseId: string;
	binLocationId: string;
	quantityDelta: number;
	movementType?: MovementType;
	reasonCode?: string;
	unitCost?: number;
	referenceType?: string;
	referenceId?: string;
	/** Signed physical count document reference (PDF id / S3 URL / etc). Required
	 *  to suppress IA002 alerts when an adjustment exceeds the SGD threshold. */
	physicalCountDocumentRef?: string;
	notes?: string;
};

export type CycleCountInput = {
	warehouseId: string;
	countType?: 'cycle_count' | 'full_physical';
	scheduledAt?: string;
	documentRef?: string;
	notes?: string;
	/** Optional bin filter — only seed lines for these bins. Empty = all bins. */
	binIds?: string[];
	/** Optional item filter — only seed lines for these items. Empty = all items present at the bins. */
	itemIds?: string[];
};

export type CycleCountLineCountInput = {
	lineId: string;
	countedQuantity: number;
	notes?: string;
};

export type AgingBucket = {
	label: string;
	minDays: number;
	maxDays: number | null;
};

export const DEFAULT_AGING_BUCKETS: AgingBucket[] = [
	{ label: '0–30', minDays: 0, maxDays: 30 },
	{ label: '31–60', minDays: 31, maxDays: 60 },
	{ label: '61–90', minDays: 61, maxDays: 90 },
	{ label: '91–180', minDays: 91, maxDays: 180 },
	{ label: '181+', minDays: 181, maxDays: null }
];

export type TransferLineInput = {
	itemId: string;
	sourceBinId: string;
	destBinId: string;
	quantityRequested: number;
	notes?: string;
};

export type TransferInput = {
	sourceWarehouseId: string;
	destWarehouseId: string;
	requestedAt?: string;
	notes?: string;
	lines: TransferLineInput[];
};

function nullable(value?: string | null) {
	if (value === undefined || value === null) return null;
	const trimmed = String(value).trim();
	return trimmed ? trimmed : null;
}

function makeTransferNumber(seq: number) {
	const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
	return `ST-${ts}-${String(seq + 1).padStart(4, '0')}`;
}

function makeCycleCountNumber(seq: number) {
	const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
	return `CC-${ts}-${String(seq + 1).padStart(4, '0')}`;
}

function daysBetween(fromIso: string, toIso: string) {
	const a = new Date(fromIso).getTime();
	const b = new Date(toIso).getTime();
	if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
	return Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24)));
}

export class WarehouseService {
	private repo: WarehouseRepository;
	private items: ItemRepository;
	private audit: AuditService;
	private user: ModuleContext['user'];

	constructor(ctx: ModuleContext) {
		this.repo = new WarehouseRepository(ctx.db);
		this.items = new ItemRepository(ctx.db);
		this.audit = new AuditService(ctx);
		this.user = ctx.user;
	}

	// ------------------------- Warehouses -------------------------

	listWarehouses() {
		return this.repo.findAllWarehouses();
	}

	async getWarehouseDetail(id: string) {
		const wh = await this.repo.findWarehouseById(id);
		if (!wh) throw new NotFoundError('Warehouse', id);
		const bins = await this.repo.findBinsByWarehouse(id);
		return { warehouse: wh, bins };
	}

	async createWarehouse(input: WarehouseInput) {
		const code = input.code?.trim();
		const name = input.name?.trim();
		if (!code) throw new ValidationError('Warehouse code is required');
		if (!name) throw new ValidationError('Warehouse name is required');

		const clash = await this.repo.findWarehouseByCode(code);
		if (clash) throw new ConflictError(`Warehouse code "${code}" already exists`);

		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		await this.repo.createWarehouse({
			id,
			code,
			name,
			status: input.status ?? 'active',
			addressLine1: nullable(input.addressLine1),
			addressLine2: nullable(input.addressLine2),
			city: nullable(input.city),
			state: nullable(input.state),
			postalCode: nullable(input.postalCode),
			country: input.country?.trim() || 'Singapore',
			contactName: nullable(input.contactName),
			contactPhone: nullable(input.contactPhone),
			contactEmail: nullable(input.contactEmail),
			notes: nullable(input.notes),
			createdAt: now,
			updatedAt: now
		});

		await this.audit.writeLog({
			action: 'inventory.warehouse.created',
			entityType: 'warehouse',
			entityId: id,
			module: 'inventory',
			actionType: 'create',
			newValue: { code, name }
		});
		return { id };
	}

	async updateWarehouse(id: string, input: WarehouseInput) {
		const existing = await this.repo.findWarehouseById(id);
		if (!existing) throw new NotFoundError('Warehouse', id);

		const code = input.code?.trim() || existing.code;
		const name = input.name?.trim() || existing.name;
		if (code !== existing.code) {
			const clash = await this.repo.findWarehouseByCode(code);
			if (clash && clash.id !== id) {
				throw new ConflictError(`Warehouse code "${code}" already exists`);
			}
		}

		await this.repo.updateWarehouse(id, {
			code,
			name,
			status: input.status ?? existing.status,
			addressLine1: nullable(input.addressLine1),
			addressLine2: nullable(input.addressLine2),
			city: nullable(input.city),
			state: nullable(input.state),
			postalCode: nullable(input.postalCode),
			country: input.country?.trim() || existing.country,
			contactName: nullable(input.contactName),
			contactPhone: nullable(input.contactPhone),
			contactEmail: nullable(input.contactEmail),
			notes: nullable(input.notes)
		});

		await this.audit.writeLog({
			action: 'inventory.warehouse.updated',
			entityType: 'warehouse',
			entityId: id,
			module: 'inventory',
			actionType: 'update',
			oldValue: { code: existing.code, name: existing.name },
			newValue: { code, name }
		});
	}

	async deleteWarehouse(id: string) {
		const existing = await this.repo.findWarehouseById(id);
		if (!existing) throw new NotFoundError('Warehouse', id);
		await this.repo.softDeleteWarehouse(id);
		await this.audit.writeLog({
			action: 'inventory.warehouse.deleted',
			entityType: 'warehouse',
			entityId: id,
			module: 'inventory',
			actionType: 'delete',
			oldValue: { code: existing.code, name: existing.name }
		});
	}

	// ------------------------- Bins -------------------------

	async listBinsForWarehouse(warehouseId: string) {
		return this.repo.findBinsByWarehouse(warehouseId);
	}

	async getBinDetail(id: string) {
		const bin = await this.repo.findBinById(id);
		if (!bin) throw new NotFoundError('Bin', id);
		return bin;
	}

	async createBin(input: BinInput) {
		const code = input.code?.trim();
		if (!code) throw new ValidationError('Bin code is required');
		const warehouse = await this.repo.findWarehouseById(input.warehouseId);
		if (!warehouse) throw new NotFoundError('Warehouse', input.warehouseId);

		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		await this.repo.createBin({
			id,
			warehouseId: input.warehouseId,
			code,
			name: nullable(input.name),
			locationType: input.locationType ?? 'general',
			aisle: nullable(input.aisle),
			rack: nullable(input.rack),
			shelf: nullable(input.shelf),
			bin: nullable(input.bin),
			barcode: nullable(input.barcode),
			isPickable: input.isPickable ?? true,
			isReceivable: input.isReceivable ?? true,
			isDefaultPutaway: !!input.isDefaultPutaway,
			status: input.status ?? 'active',
			notes: nullable(input.notes),
			createdAt: now,
			updatedAt: now
		});

		await this.audit.writeLog({
			action: 'inventory.bin.created',
			entityType: 'warehouse_bin',
			entityId: id,
			module: 'inventory',
			actionType: 'create',
			newValue: { warehouseId: input.warehouseId, code, locationType: input.locationType ?? 'general' }
		});
		return { id };
	}

	async updateBin(id: string, input: Partial<BinInput>) {
		const existing = await this.repo.findBinById(id);
		if (!existing) throw new NotFoundError('Bin', id);

		await this.repo.updateBin(id, {
			code: input.code?.trim() || existing.code,
			name: nullable(input.name) ?? existing.name,
			locationType: input.locationType ?? existing.locationType,
			aisle: nullable(input.aisle),
			rack: nullable(input.rack),
			shelf: nullable(input.shelf),
			bin: nullable(input.bin),
			barcode: nullable(input.barcode),
			isPickable: input.isPickable ?? existing.isPickable,
			isReceivable: input.isReceivable ?? existing.isReceivable,
			isDefaultPutaway: input.isDefaultPutaway ?? existing.isDefaultPutaway,
			status: input.status ?? existing.status,
			notes: nullable(input.notes)
		});

		await this.audit.writeLog({
			action: 'inventory.bin.updated',
			entityType: 'warehouse_bin',
			entityId: id,
			module: 'inventory',
			actionType: 'update'
		});
	}

	async deleteBin(id: string) {
		const existing = await this.repo.findBinById(id);
		if (!existing) throw new NotFoundError('Bin', id);
		await this.repo.softDeleteBin(id);
		await this.audit.writeLog({
			action: 'inventory.bin.deleted',
			entityType: 'warehouse_bin',
			entityId: id,
			module: 'inventory',
			actionType: 'delete'
		});
	}

	async lookupBinByBarcode(value: string) {
		const v = value.trim();
		if (!v) return null;
		const bin = await this.repo.findBinByBarcode(v);
		if (!bin) return null;
		const warehouse = await this.repo.findWarehouseById(bin.warehouseId);
		return { bin, warehouse };
	}

	// ------------------------- Stock levels & movements -------------------------

	listStockLevels(filters: { itemId?: string; warehouseId?: string; binLocationId?: string }) {
		return this.repo.listStockLevels(filters);
	}

	listStockMovementsForItem(itemId: string) {
		return this.repo.listMovementsForItem(itemId);
	}

	async getStockLevelByItem(itemId: string) {
		return this.repo.listStockLevels({ itemId });
	}

	/**
	 * Apply a quantity delta to a single (item, warehouse, bin) cell and write a
	 * movement record. Creates the stock_levels row on first touch.
	 */
	async adjustStock(input: StockAdjustmentInput) {
		const { itemId, warehouseId, binLocationId } = input;
		const delta = Number(input.quantityDelta);
		if (!Number.isFinite(delta) || delta === 0) {
			throw new ValidationError('quantityDelta must be a non-zero number');
		}

		const item = await this.items.findById(itemId);
		if (!item) throw new NotFoundError('Item', itemId);
		const warehouse = await this.repo.findWarehouseById(warehouseId);
		if (!warehouse) throw new NotFoundError('Warehouse', warehouseId);
		const bin = await this.repo.findBinById(binLocationId);
		if (!bin) throw new NotFoundError('Bin', binLocationId);
		if (bin.warehouseId !== warehouseId) {
			throw new ValidationError('Bin does not belong to the specified warehouse');
		}

		const now = new Date().toISOString();
		const existing = await this.repo.findStockLevel(itemId, warehouseId, binLocationId);
		let next: number;
		if (existing) {
			next = Number(existing.quantityOnHand) + delta;
			if (next < 0) {
				throw new ValidationError(
					`Movement would drive on-hand quantity negative (current ${existing.quantityOnHand}, delta ${delta})`
				);
			}
			await this.repo.updateStockLevelQty(existing.id, next, now, input.unitCost);
		} else {
			if (delta < 0) {
				throw new ValidationError('Cannot decrement stock that has never existed at this bin');
			}
			next = delta;
			await this.repo.insertStockLevel({
				id: crypto.randomUUID(),
				itemId,
				warehouseId,
				binLocationId,
				quantityOnHand: next,
				quantityReserved: 0,
				quantityIncoming: 0,
				unitCost: input.unitCost ?? null,
				lastMovementAt: now,
				createdAt: now,
				updatedAt: now
			});
		}

		const movementType = input.movementType ?? (delta >= 0 ? 'receipt' : 'issue');
		const unitCostForValue =
			input.unitCost ??
			(existing?.unitCost as number | null | undefined) ??
			(item.lastCost as number | null) ??
			(item.averageCost as number | null) ??
			(item.standardCost as number | null) ??
			null;
		const valueDelta = unitCostForValue !== null ? delta * Number(unitCostForValue) : null;
		const physicalCountDocumentRef = nullable(input.physicalCountDocumentRef);

		// IA002: any adjustment / scrap / cycle_count whose absolute SGD value
		// exceeds the threshold without a signed physical count document flips
		// the alert flag. The movement still posts; downstream alerts pick this
		// up from `ia_alert_code` or the audit log.
		const isFlaggableType =
			movementType === 'adjustment' ||
			movementType === 'scrap' ||
			movementType === 'cycle_count';
		const iaAlertCode =
			isFlaggableType &&
			valueDelta !== null &&
			Math.abs(valueDelta) > IA002_VALUE_THRESHOLD &&
			!physicalCountDocumentRef
				? 'IA002'
				: null;

		const movementId = crypto.randomUUID();
		await this.repo.insertMovement({
			id: movementId,
			itemId,
			warehouseId,
			binLocationId,
			movementType,
			reasonCode: nullable(input.reasonCode),
			quantityDelta: delta,
			quantityAfter: next,
			unitCost: input.unitCost ?? null,
			valueDelta,
			referenceType: nullable(input.referenceType),
			referenceId: nullable(input.referenceId),
			physicalCountDocumentRef,
			iaAlertCode,
			performedByUserId: this.user?.id ?? null,
			performedByEmail: this.user?.email ?? null,
			notes: nullable(input.notes),
			createdAt: now,
			updatedAt: now
		});

		// Update item-level lastCost / averageCost projection so the item list stays useful.
		if (delta > 0 && input.unitCost !== undefined && Number.isFinite(input.unitCost)) {
			const newAverage = await this.computeRollingAverage(item, delta, input.unitCost);
			await this.items.update(itemId, {
				lastCost: input.unitCost,
				averageCost: newAverage
			});
		}

		await this.audit.writeLog({
			action: 'inventory.stock.adjusted',
			entityType: 'inventory_stock_level',
			entityId: itemId,
			module: 'inventory',
			actionType: 'update',
			metadata: {
				itemId,
				warehouseId,
				binLocationId,
				delta,
				movementType,
				reasonCode: input.reasonCode ?? null,
				referenceType: input.referenceType ?? null,
				referenceId: input.referenceId ?? null,
				valueDelta,
				physicalCountDocumentRef: physicalCountDocumentRef ?? null,
				iaAlertCode
			}
		});

		if (iaAlertCode === 'IA002') {
			await this.audit.writeLog({
				action: 'inventory.alert.ia002',
				entityType: 'inventory_stock_movement',
				entityId: movementId,
				module: 'inventory',
				actionType: 'permission_change',
				metadata: {
					alertCode: 'IA002',
					thresholdSgd: IA002_VALUE_THRESHOLD,
					valueDelta,
					movementType,
					itemId,
					warehouseId,
					binLocationId,
					reasonCode: input.reasonCode ?? null,
					notes: input.notes ?? null,
					reason:
						'Adjustment value exceeds SGD threshold without a signed physical count document.'
				}
			});
		}

		return { movementId, quantityAfter: next, valueDelta, iaAlertCode };
	}

	/**
	 * Adjust the reserved quantity on a single (item, warehouse, bin) cell without
	 * moving physical stock. Used by sales orders to hold stock at confirm and
	 * release it as it ships. ATP = quantityOnHand − quantityReserved.
	 */
	async reserveStock(input: {
		itemId: string;
		warehouseId: string;
		binLocationId: string;
		quantityDelta: number;
	}) {
		const delta = Number(input.quantityDelta);
		if (!Number.isFinite(delta) || delta === 0) {
			throw new ValidationError('quantityDelta must be a non-zero number');
		}
		const existing = await this.repo.findStockLevel(
			input.itemId,
			input.warehouseId,
			input.binLocationId
		);
		if (!existing) {
			throw new ValidationError('Cannot reserve stock at a bin with no stock level');
		}
		const nextReserved = Number(existing.quantityReserved) + delta;
		if (nextReserved < 0) {
			throw new ValidationError(
				`Reservation release would drive reserved quantity negative (current ${existing.quantityReserved}, delta ${delta})`
			);
		}
		const available = Number(existing.quantityOnHand) - Number(existing.quantityReserved);
		if (delta > 0 && delta > available) {
			throw new ValidationError(
				`Insufficient available-to-promise: requested ${delta}, available ${available}`
			);
		}
		await this.repo.updateStockLevelReserved(existing.id, nextReserved);
		return {
			stockLevelId: existing.id,
			quantityReserved: nextReserved,
			available: Number(existing.quantityOnHand) - nextReserved
		};
	}

	private async computeRollingAverage(
		item: { id: string; averageCost: number | null },
		incomingQty: number,
		incomingUnitCost: number
	) {
		// Levels are post-adjustment; subtract incomingQty to get the prior on-hand
		// total across all bins for this item, then apply weighted average against
		// the prior item-level averageCost snapshot.
		const levels = await this.repo.listStockLevels({ itemId: item.id });
		const prevAvg = Number(item.averageCost ?? incomingUnitCost);
		const totalAfter = levels.reduce(
			(sum, row) => sum + (Number(row.level.quantityOnHand) || 0),
			0
		);
		const prevQty = Math.max(0, totalAfter - incomingQty);
		const totalQty = prevQty + incomingQty;
		if (totalQty <= 0) return incomingUnitCost;
		return Number(((prevAvg * prevQty + incomingUnitCost * incomingQty) / totalQty).toFixed(4));
	}

	// ------------------------- Transfers -------------------------

	async listTransfers() {
		const transfers = await this.repo.listTransfers();
		return transfers;
	}

	async getTransferDetail(id: string) {
		const transfer = await this.repo.findTransferById(id);
		if (!transfer) throw new NotFoundError('Transfer', id);
		const lines = await this.repo.listTransferLinesRaw(id);
		return { transfer, lines };
	}

	async createTransfer(input: TransferInput) {
		if (input.lines.length === 0) {
			throw new ValidationError('Transfer must include at least one line');
		}
		const source = await this.repo.findWarehouseById(input.sourceWarehouseId);
		if (!source) throw new NotFoundError('Source warehouse', input.sourceWarehouseId);
		const dest = await this.repo.findWarehouseById(input.destWarehouseId);
		if (!dest) throw new NotFoundError('Dest warehouse', input.destWarehouseId);
		if (source.id === dest.id) {
			// allow same warehouse but still validate bins differ
		}

		for (const line of input.lines) {
			if (!line.itemId || !line.sourceBinId || !line.destBinId) {
				throw new ValidationError('Each transfer line must reference itemId / sourceBinId / destBinId');
			}
			if (!(line.quantityRequested > 0)) {
				throw new ValidationError('Each transfer line must request a positive quantity');
			}
			if (line.sourceBinId === line.destBinId) {
				throw new ValidationError('Source and destination bin must differ on a transfer line');
			}
			const sourceBin = await this.repo.findBinById(line.sourceBinId);
			if (!sourceBin || sourceBin.warehouseId !== source.id) {
				throw new ValidationError('Source bin does not belong to source warehouse');
			}
			const destBin = await this.repo.findBinById(line.destBinId);
			if (!destBin || destBin.warehouseId !== dest.id) {
				throw new ValidationError('Destination bin does not belong to destination warehouse');
			}
		}

		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		const seq = await this.repo.nextTransferNumberCount();
		const transferNumber = makeTransferNumber(seq);

		await this.repo.insertTransfer({
			id,
			transferNumber,
			status: 'draft',
			sourceWarehouseId: source.id,
			destWarehouseId: dest.id,
			requestedAt: input.requestedAt ?? now,
			performedByUserId: this.user?.id ?? null,
			performedByEmail: this.user?.email ?? null,
			notes: nullable(input.notes),
			createdAt: now,
			updatedAt: now
		});

		for (const line of input.lines) {
			await this.repo.insertTransferLine({
				id: crypto.randomUUID(),
				transferId: id,
				itemId: line.itemId,
				sourceBinId: line.sourceBinId,
				destBinId: line.destBinId,
				quantityRequested: line.quantityRequested,
				quantityShipped: 0,
				quantityReceived: 0,
				notes: nullable(line.notes),
				createdAt: now,
				updatedAt: now
			});
		}

		await this.audit.writeLog({
			action: 'inventory.transfer.created',
			entityType: 'inventory_stock_transfer',
			entityId: id,
			module: 'inventory',
			actionType: 'create',
			newValue: { transferNumber, sourceWarehouseId: source.id, destWarehouseId: dest.id }
		});

		return { id, transferNumber };
	}

	/** Move all line `quantityRequested` out of source bins; mark `in_transit`. */
	async shipTransfer(id: string) {
		const transfer = await this.repo.findTransferById(id);
		if (!transfer) throw new NotFoundError('Transfer', id);
		if (transfer.status !== 'draft') {
			throw new ValidationError(`Transfer is in status "${transfer.status}", only draft can ship`);
		}
		const lines = await this.repo.listTransferLinesRaw(id);
		const now = new Date().toISOString();

		for (const line of lines) {
			const requested = Number(line.quantityRequested);
			await this.adjustStock({
				itemId: line.itemId,
				warehouseId: transfer.sourceWarehouseId,
				binLocationId: line.sourceBinId,
				quantityDelta: -requested,
				movementType: 'transfer_out',
				referenceType: 'transfer',
				referenceId: id
			});
			await this.repo.updateTransferLine(line.id, { quantityShipped: requested });
		}

		await this.repo.updateTransfer(id, {
			status: 'in_transit',
			shippedAt: now
		});

		await this.audit.writeLog({
			action: 'inventory.transfer.shipped',
			entityType: 'inventory_stock_transfer',
			entityId: id,
			module: 'inventory',
			actionType: 'update',
			metadata: { transferNumber: transfer.transferNumber }
		});
	}

	/**
	 * Receive transfer at destination. `actuals` lets the warehouse manager
	 * record short shipments; omitting it defaults to qty shipped.
	 */
	async receiveTransfer(id: string, actuals?: Array<{ lineId: string; quantityReceived: number }>) {
		const transfer = await this.repo.findTransferById(id);
		if (!transfer) throw new NotFoundError('Transfer', id);
		if (transfer.status !== 'in_transit') {
			throw new ValidationError(`Transfer is in status "${transfer.status}", cannot receive`);
		}
		const lines = await this.repo.listTransferLinesRaw(id);
		const actualsById = new Map<string, number>();
		for (const a of actuals ?? []) {
			actualsById.set(a.lineId, Number(a.quantityReceived));
		}
		const now = new Date().toISOString();

		for (const line of lines) {
			const shipped = Number(line.quantityShipped);
			const received = actualsById.has(line.id)
				? Math.max(0, Math.min(shipped, actualsById.get(line.id)!))
				: shipped;

			if (received > 0) {
				await this.adjustStock({
					itemId: line.itemId,
					warehouseId: transfer.destWarehouseId,
					binLocationId: line.destBinId,
					quantityDelta: received,
					movementType: 'transfer_in',
					referenceType: 'transfer',
					referenceId: id
				});
			}
			await this.repo.updateTransferLine(line.id, { quantityReceived: received });
		}

		await this.repo.updateTransfer(id, {
			status: 'completed',
			receivedAt: now
		});

		await this.audit.writeLog({
			action: 'inventory.transfer.received',
			entityType: 'inventory_stock_transfer',
			entityId: id,
			module: 'inventory',
			actionType: 'update',
			metadata: { transferNumber: transfer.transferNumber }
		});
	}

	async cancelTransfer(id: string) {
		const transfer = await this.repo.findTransferById(id);
		if (!transfer) throw new NotFoundError('Transfer', id);
		if (transfer.status !== 'draft') {
			throw new ValidationError('Only draft transfers can be cancelled');
		}
		await this.repo.updateTransfer(id, { status: 'cancelled' });
		await this.audit.writeLog({
			action: 'inventory.transfer.cancelled',
			entityType: 'inventory_stock_transfer',
			entityId: id,
			module: 'inventory',
			actionType: 'update'
		});
	}

	// ------------------------- Movements (audit trail) -------------------------

	listAllMovements(filters: {
		itemId?: string;
		warehouseId?: string;
		movementType?: MovementType;
		alertCode?: string;
		limit?: number;
	}) {
		return this.repo.listMovements(filters);
	}

	// ------------------------- Cycle counts -------------------------

	listCycleCounts() {
		return this.repo.listCycleCounts();
	}

	async getCycleCountDetail(id: string) {
		const session = await this.repo.findCycleCountById(id);
		if (!session) throw new NotFoundError('CycleCount', id);
		const lines = await this.repo.listCycleCountLines(id);
		return { session, lines };
	}

	/**
	 * Open a cycle count session and snapshot expected on-hand for every
	 * (item, bin) cell currently in scope. The clerk then fills counted_quantity
	 * per line and posts.
	 */
	async createCycleCount(input: CycleCountInput) {
		const wh = await this.repo.findWarehouseById(input.warehouseId);
		if (!wh) throw new NotFoundError('Warehouse', input.warehouseId);

		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		const seq = await this.repo.nextCycleCountNumberCount();
		const countNumber = makeCycleCountNumber(seq);

		await this.repo.insertCycleCount({
			id,
			countNumber,
			warehouseId: input.warehouseId,
			status: 'counting',
			countType: input.countType ?? 'cycle_count',
			scheduledAt: input.scheduledAt ?? now,
			documentRef: nullable(input.documentRef),
			performedByUserId: this.user?.id ?? null,
			performedByEmail: this.user?.email ?? null,
			notes: nullable(input.notes),
			createdAt: now,
			updatedAt: now
		});

		// Seed lines from current stock levels at this warehouse.
		const allBins = await this.repo.findBinsByWarehouse(input.warehouseId);
		const binIdSet = input.binIds && input.binIds.length > 0 ? new Set(input.binIds) : null;
		const itemIdSet = input.itemIds && input.itemIds.length > 0 ? new Set(input.itemIds) : null;
		const levels = await this.repo.listStockLevels({ warehouseId: input.warehouseId });

		for (const lvl of levels) {
			if (binIdSet && !binIdSet.has(lvl.bin.id)) continue;
			if (itemIdSet && !itemIdSet.has(lvl.item.id)) continue;
			await this.repo.insertCycleCountLine({
				id: crypto.randomUUID(),
				cycleCountId: id,
				itemId: lvl.item.id,
				binLocationId: lvl.bin.id,
				expectedQuantity: Number(lvl.level.quantityOnHand) || 0,
				countedQuantity: null,
				variance: null,
				unitCost: lvl.level.unitCost ?? null,
				varianceValue: null,
				movementId: null,
				notes: null,
				createdAt: now,
				updatedAt: now
			});
		}

		// If user requested explicit (item × bin) combos that have zero stock, still
		// surface them as zero-expected lines so the clerk can record found stock.
		if (itemIdSet && binIdSet) {
			for (const itemId of itemIdSet) {
				for (const binId of binIdSet) {
					const exists = levels.find((l) => l.item.id === itemId && l.bin.id === binId);
					if (exists) continue;
					await this.repo.insertCycleCountLine({
						id: crypto.randomUUID(),
						cycleCountId: id,
						itemId,
						binLocationId: binId,
						expectedQuantity: 0,
						countedQuantity: null,
						variance: null,
						unitCost: null,
						varianceValue: null,
						movementId: null,
						notes: null,
						createdAt: now,
						updatedAt: now
					});
				}
			}
		}

		await this.audit.writeLog({
			action: 'inventory.cycle_count.created',
			entityType: 'inventory_cycle_count',
			entityId: id,
			module: 'inventory',
			actionType: 'create',
			newValue: { countNumber, warehouseId: input.warehouseId, countType: input.countType ?? 'cycle_count' }
		});

		return { id, countNumber };
	}

	async recordCycleCounts(id: string, counts: CycleCountLineCountInput[]) {
		const session = await this.repo.findCycleCountById(id);
		if (!session) throw new NotFoundError('CycleCount', id);
		if (session.status !== 'counting' && session.status !== 'draft') {
			throw new ValidationError(`Cycle count in status "${session.status}" cannot accept counts`);
		}
		const lines = await this.repo.listCycleCountLines(id);
		const lineById = new Map(lines.map((l) => [l.id, l]));
		const now = new Date().toISOString();
		for (const entry of counts) {
			const line = lineById.get(entry.lineId);
			if (!line) continue;
			const counted = Number(entry.countedQuantity);
			const expected = Number(line.expectedQuantity);
			const variance = counted - expected;
			const unitCost = line.unitCost ?? null;
			const varianceValue = unitCost !== null ? variance * Number(unitCost) : null;
			await this.repo.updateCycleCountLine(line.id, {
				countedQuantity: counted,
				variance,
				varianceValue,
				notes: nullable(entry.notes) ?? line.notes
			});
		}
		await this.repo.updateCycleCount(id, { countedAt: now });
	}

	/**
	 * Post variances: for each line with countedQuantity set, write an
	 * adjustment movement through adjustStock so the audit trail + IA002
	 * threshold logic apply uniformly.
	 */
	async postCycleCount(id: string) {
		const session = await this.repo.findCycleCountById(id);
		if (!session) throw new NotFoundError('CycleCount', id);
		if (session.status === 'posted') {
			throw new ValidationError('Cycle count already posted');
		}
		if (session.status === 'cancelled') {
			throw new ValidationError('Cancelled cycle count cannot be posted');
		}
		const lines = await this.repo.listCycleCountLines(id);
		const now = new Date().toISOString();
		const physicalDoc = session.documentRef ?? null;

		for (const line of lines) {
			if (line.countedQuantity === null || line.countedQuantity === undefined) continue;
			const variance = Number(line.countedQuantity) - Number(line.expectedQuantity);
			if (variance === 0) continue;
			const result = await this.adjustStock({
				itemId: line.itemId,
				warehouseId: session.warehouseId,
				binLocationId: line.binLocationId,
				quantityDelta: variance,
				movementType: 'cycle_count',
				reasonCode: 'cycle_count_variance',
				unitCost: line.unitCost ?? undefined,
				referenceType: 'cycle_count',
				referenceId: id,
				physicalCountDocumentRef: physicalDoc ?? undefined,
				notes: line.notes ?? undefined
			});
			await this.repo.updateCycleCountLine(line.id, { movementId: result.movementId });
		}

		await this.repo.updateCycleCount(id, {
			status: 'posted',
			postedAt: now,
			approvedByUserId: this.user?.id ?? null,
			approvedByEmail: this.user?.email ?? null
		});

		await this.audit.writeLog({
			action: 'inventory.cycle_count.posted',
			entityType: 'inventory_cycle_count',
			entityId: id,
			module: 'inventory',
			actionType: 'update',
			metadata: { countNumber: session.countNumber, warehouseId: session.warehouseId }
		});
	}

	async cancelCycleCount(id: string) {
		const session = await this.repo.findCycleCountById(id);
		if (!session) throw new NotFoundError('CycleCount', id);
		if (session.status === 'posted') {
			throw new ValidationError('Posted cycle count cannot be cancelled');
		}
		await this.repo.updateCycleCount(id, { status: 'cancelled' });
		await this.audit.writeLog({
			action: 'inventory.cycle_count.cancelled',
			entityType: 'inventory_cycle_count',
			entityId: id,
			module: 'inventory',
			actionType: 'update'
		});
	}

	/**
	 * Attach a signed physical-count document to an existing cycle count.
	 * Caller has already PUT the bytes into R2; this just records the
	 * reference so `postCycleCount` will pick it up as `physicalCountDocumentRef`
	 * and suppress IA002 alerts on variance adjustments.
	 *
	 * `documentRef` is stored as-is. When it starts with `r2:` the UI knows
	 * to render a download link via `/api/inventory/cycle-counts/[id]/document`;
	 * plain text refs (legacy / out-of-system PDFs) keep working.
	 */
	async attachCycleCountDocument(
		id: string,
		input: { documentRef: string; fileName?: string; contentType?: string; sizeBytes?: number }
	) {
		const session = await this.repo.findCycleCountById(id);
		if (!session) throw new NotFoundError('CycleCount', id);
		if (session.status === 'cancelled') {
			throw new ValidationError('Cancelled cycle count cannot accept a document');
		}
		const documentRef = nullable(input.documentRef);
		if (!documentRef) throw new ValidationError('documentRef is required');
		await this.repo.updateCycleCount(id, { documentRef });
		await this.audit.writeLog({
			action: 'inventory.cycle_count.document_attached',
			entityType: 'inventory_cycle_count',
			entityId: id,
			module: 'inventory',
			actionType: 'update',
			metadata: {
				countNumber: session.countNumber,
				documentRef,
				fileName: input.fileName ?? null,
				contentType: input.contentType ?? null,
				sizeBytes: input.sizeBytes ?? null
			}
		});
		return { documentRef };
	}

	// ------------------------- Aging -------------------------

	/**
	 * Inventory aging report. For each (item, warehouse, bin) cell, walk
	 * movements ordered by createdAt, build a FIFO queue of receipt layers,
	 * consume them on issues, and finally bucket the remaining queue by
	 * (now - receivedAt) days.
	 *
	 * This is computed on-demand without a cost_layers table; volumes in the
	 * mini-ERP target (<100k movements per item) are fine for this approach.
	 */
	async getInventoryAging(filters: { warehouseId?: string; asOf?: string } = {}) {
		const asOfIso = filters.asOf ?? new Date().toISOString();
		const movements = await this.repo.listMovementsForAging(filters);

		type Layer = { receivedAt: string; quantity: number; unitCost: number | null };
		type Cell = {
			itemId: string;
			warehouseId: string;
			binLocationId: string;
			layers: Layer[];
		};
		const cells = new Map<string, Cell>();

		for (const m of movements) {
			const key = `${m.itemId}|${m.warehouseId}|${m.binLocationId}`;
			let cell = cells.get(key);
			if (!cell) {
				cell = {
					itemId: m.itemId,
					warehouseId: m.warehouseId,
					binLocationId: m.binLocationId,
					layers: []
				};
				cells.set(key, cell);
			}
			const delta = Number(m.quantityDelta);
			if (!Number.isFinite(delta) || delta === 0) continue;
			if (delta > 0) {
				cell.layers.push({
					receivedAt: m.createdAt,
					quantity: delta,
					unitCost: m.unitCost ?? null
				});
			} else {
				// Consume oldest layers FIFO.
				let toConsume = -delta;
				while (toConsume > 0 && cell.layers.length > 0) {
					const head = cell.layers[0];
					if (head.quantity <= toConsume) {
						toConsume -= head.quantity;
						cell.layers.shift();
					} else {
						head.quantity -= toConsume;
						toConsume = 0;
					}
				}
				// If layers ran out (e.g. negative opening balance not represented),
				// remaining toConsume is dropped.
			}
		}

		const rows: Array<{
			itemId: string;
			warehouseId: string;
			binLocationId: string;
			totalOnHand: number;
			totalValue: number;
			buckets: Array<{ label: string; quantity: number; value: number; receivedAt: string | null }>;
			oldestReceivedAt: string | null;
		}> = [];

		for (const cell of cells.values()) {
			if (cell.layers.length === 0) continue;
			const buckets = DEFAULT_AGING_BUCKETS.map((b) => ({
				label: b.label,
				quantity: 0,
				value: 0,
				receivedAt: null as string | null
			}));
			let totalOnHand = 0;
			let totalValue = 0;
			let oldest: string | null = null;
			for (const layer of cell.layers) {
				const ageDays = daysBetween(layer.receivedAt, asOfIso);
				const bucketIdx = DEFAULT_AGING_BUCKETS.findIndex(
					(b) => ageDays >= b.minDays && (b.maxDays === null || ageDays <= b.maxDays)
				);
				const bIdx = bucketIdx >= 0 ? bucketIdx : DEFAULT_AGING_BUCKETS.length - 1;
				const layerValue = layer.unitCost !== null ? layer.quantity * layer.unitCost : 0;
				buckets[bIdx].quantity += layer.quantity;
				buckets[bIdx].value += layerValue;
				if (
					buckets[bIdx].receivedAt === null ||
					new Date(layer.receivedAt) < new Date(buckets[bIdx].receivedAt!)
				) {
					buckets[bIdx].receivedAt = layer.receivedAt;
				}
				totalOnHand += layer.quantity;
				totalValue += layerValue;
				if (oldest === null || new Date(layer.receivedAt) < new Date(oldest)) {
					oldest = layer.receivedAt;
				}
			}
			rows.push({
				itemId: cell.itemId,
				warehouseId: cell.warehouseId,
				binLocationId: cell.binLocationId,
				totalOnHand,
				totalValue,
				buckets,
				oldestReceivedAt: oldest
			});
		}

		return { asOf: asOfIso, buckets: DEFAULT_AGING_BUCKETS, rows };
	}
}
