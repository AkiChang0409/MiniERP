import type { ModuleContext } from '$platform/modules/types';
import { ConflictError, NotFoundError } from '$platform/modules/errors';
import { AuditService } from '$platform/audit/audit-service';
import { ItemRepository } from './repository';

export type ItemType =
	| 'raw_material'
	| 'finished_good'
	| 'consumable'
	| 'sub_assembly'
	| 'service';

export type ItemStatus = 'active' | 'inactive' | 'discontinued';

export type ValuationMethod = 'fifo' | 'weighted_average' | 'standard_cost';

export type BarcodeType =
	| 'ean13'
	| 'ean8'
	| 'upc_a'
	| 'code128'
	| 'code39'
	| 'qr'
	| 'datamatrix'
	| 'custom';

export type PackagingLevel = 'each' | 'inner' | 'case' | 'pallet';

export type AttachmentType =
	| 'image'
	| 'datasheet'
	| 'certificate'
	| 'manual'
	| 'safety_doc'
	| 'other';

export type ItemBarcodeInput = {
	id?: string;
	barcodeValue: string;
	barcodeType?: BarcodeType;
	packagingLevel?: PackagingLevel;
	isPrimary?: boolean;
	notes?: string;
};

export type ItemAttachmentInput = {
	id?: string;
	attachmentType?: AttachmentType;
	title: string;
	fileName?: string;
	fileUrl?: string;
	mimeType?: string;
	isPrimaryImage?: boolean;
	notes?: string;
};

export type ItemInput = {
	code: string;
	name: string;
	description?: string;
	itemType?: ItemType;
	status?: ItemStatus;
	category?: string;
	uom?: string;
	uomCategory?: string;
	preferredSupplierId?: string | null;

	reorderPoint?: number;
	minLevel?: number;
	maxLevel?: number;
	leadTimeDays?: number;
	lotControl?: boolean;
	serialControl?: boolean;
	shelfLifeDays?: number;

	valuationMethod?: ValuationMethod;
	standardCost?: number;
	lastCost?: number;
	averageCost?: number;
	currency?: string;

	primaryImageUrl?: string;
	notes?: string;

	barcodes?: ItemBarcodeInput[];
	attachments?: ItemAttachmentInput[];
};

function nullable(value?: string | null) {
	if (value === undefined || value === null) return null;
	const trimmed = String(value).trim();
	return trimmed ? trimmed : null;
}

function finiteOrNull(value?: number | null): number | null {
	if (value === undefined || value === null) return null;
	const num = Number(value);
	return Number.isFinite(num) ? num : null;
}

function intOrNull(value?: number | null): number | null {
	if (value === undefined || value === null) return null;
	const num = Number(value);
	if (!Number.isFinite(num)) return null;
	return Math.trunc(num);
}

// Code128 is the most universal symbology and works with the data we expect
// (alphanumeric item codes). Reserve numeric-only symbologies for explicit user
// choice. Format: <itemCode>-<6 hex chars>.
function generateBarcodeValue(itemCode: string): string {
	const normalized = itemCode.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
	const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
	const head = normalized.slice(0, 16) || 'ITEM';
	return `${head}-${suffix}`;
}

export class InventoryService {
	private repo: ItemRepository;
	private db: ModuleContext['db'];
	private audit: AuditService;
	private user: ModuleContext['user'];

	constructor(ctx: ModuleContext) {
		this.db = ctx.db;
		this.repo = new ItemRepository(ctx.db);
		this.audit = new AuditService(ctx);
		this.user = ctx.user;
	}

	// ------- Reads -------

	async listItems() {
		const rows = await this.repo.findAll();
		const ids = rows.map((r) => r.id);
		const [barcodes, attachments] = await Promise.all([
			this.repo.listBarcodesByItemIds(ids),
			this.repo.listAttachmentsByItemIds(ids)
		]);
		const barcodesByItem = new Map<string, typeof barcodes>();
		for (const b of barcodes) {
			const list = barcodesByItem.get(b.itemId) ?? [];
			list.push(b);
			barcodesByItem.set(b.itemId, list);
		}
		const attachmentsByItem = new Map<string, typeof attachments>();
		for (const a of attachments) {
			const list = attachmentsByItem.get(a.itemId) ?? [];
			list.push(a);
			attachmentsByItem.set(a.itemId, list);
		}
		return rows.map((row) => ({
			...row,
			barcodes: barcodesByItem.get(row.id) ?? [],
			attachments: attachmentsByItem.get(row.id) ?? []
		}));
	}

	async getItemDetail(id: string) {
		const item = await this.repo.findById(id);
		if (!item) throw new NotFoundError('Item', id);
		const [barcodes, attachments] = await Promise.all([
			this.repo.listBarcodesByItemIds([id]),
			this.repo.listAttachmentsByItemIds([id])
		]);
		return { item, barcodes, attachments };
	}

	async lookupByBarcode(value: string) {
		const trimmed = value.trim();
		if (!trimmed) return null;
		const match = await this.repo.findByBarcode(trimmed);
		if (!match) {
			// Fall back: maybe the scanned value matches the item.code directly.
			const direct = await this.repo.findByCode(trimmed);
			if (!direct) return null;
			return { item: direct, barcode: null };
		}
		const item = await this.repo.findById(match.itemId);
		if (!item) return null;
		return { item, barcode: match };
	}

	// ------- Writes -------

	async createItem(input: ItemInput) {
		const code = input.code?.trim();
		if (!code) throw new Error('Item code is required');
		const name = input.name?.trim();
		if (!name) throw new Error('Item name is required');

		const existing = await this.repo.findByCode(code);
		if (existing) {
			throw new ConflictError(`Item code "${code}" already exists`);
		}

		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		const barcodes = (input.barcodes ?? []).filter((b) => b.barcodeValue?.trim());
		const primaryBarcode = barcodes.find((b) => b.isPrimary) ?? barcodes[0] ?? null;

		const attachments = (input.attachments ?? []).filter((a) => a.title?.trim());
		const primaryImage =
			attachments.find((a) => a.isPrimaryImage && a.fileUrl) ?? null;

		await this.repo.create({
			id,
			code,
			name,
			description: nullable(input.description),
			itemType: input.itemType ?? 'raw_material',
			status: input.status ?? 'active',
			category: nullable(input.category),
			uom: input.uom?.trim() || 'unit',
			uomCategory: nullable(input.uomCategory),
			preferredSupplierId: nullable(input.preferredSupplierId),

			reorderPoint: finiteOrNull(input.reorderPoint),
			minLevel: finiteOrNull(input.minLevel),
			maxLevel: finiteOrNull(input.maxLevel),
			leadTimeDays: intOrNull(input.leadTimeDays),
			lotControl: !!input.lotControl,
			serialControl: !!input.serialControl,
			shelfLifeDays: intOrNull(input.shelfLifeDays),

			valuationMethod: input.valuationMethod ?? 'weighted_average',
			standardCost: finiteOrNull(input.standardCost),
			lastCost: finiteOrNull(input.lastCost),
			averageCost: finiteOrNull(input.averageCost),
			currency: input.currency?.trim() || 'SGD',

			primaryImageUrl:
				nullable(input.primaryImageUrl) ?? (primaryImage?.fileUrl ?? null),
			primaryBarcodeValue: primaryBarcode?.barcodeValue ?? null,
			primaryBarcodeType: primaryBarcode?.barcodeType ?? null,

			notes: nullable(input.notes),
			createdAt: now,
			updatedAt: now
		});

		for (const b of barcodes) {
			await this.repo.addBarcode({
				id: b.id ?? crypto.randomUUID(),
				itemId: id,
				barcodeValue: b.barcodeValue.trim(),
				barcodeType: b.barcodeType ?? 'code128',
				packagingLevel: b.packagingLevel ?? 'each',
				isPrimary: !!b.isPrimary,
				notes: nullable(b.notes),
				createdAt: now,
				updatedAt: now
			});
		}

		for (const a of attachments) {
			await this.repo.addAttachment({
				id: a.id ?? crypto.randomUUID(),
				itemId: id,
				attachmentType: a.attachmentType ?? 'other',
				title: a.title.trim(),
				fileName: nullable(a.fileName),
				fileUrl: nullable(a.fileUrl),
				mimeType: nullable(a.mimeType),
				isPrimaryImage: !!a.isPrimaryImage,
				notes: nullable(a.notes),
				createdAt: now,
				updatedAt: now
			});
		}

		await this.audit.writeLog({
			action: 'inventory.item.created',
			entityType: 'inventory_item',
			entityId: id,
			module: 'inventory',
			actionType: 'create',
			newValue: { code, name, itemType: input.itemType ?? 'raw_material' }
		});

		return { id };
	}

	async updateItem(id: string, input: ItemInput) {
		const existing = await this.repo.findById(id);
		if (!existing) throw new NotFoundError('Item', id);

		const code = input.code?.trim() || existing.code;
		const name = input.name?.trim() || existing.name;

		if (code !== existing.code) {
			const clash = await this.repo.findByCode(code);
			if (clash && clash.id !== id) {
				throw new ConflictError(`Item code "${code}" already exists`);
			}
		}

		const barcodes = (input.barcodes ?? []).filter((b) => b.barcodeValue?.trim());
		const primaryBarcode = barcodes.find((b) => b.isPrimary) ?? barcodes[0] ?? null;
		const attachments = (input.attachments ?? []).filter((a) => a.title?.trim());
		const primaryImage = attachments.find((a) => a.isPrimaryImage && a.fileUrl) ?? null;

		const now = new Date().toISOString();

		await this.repo.update(id, {
			code,
			name,
			description: nullable(input.description),
			itemType: input.itemType ?? existing.itemType,
			status: input.status ?? existing.status,
			category: nullable(input.category),
			uom: input.uom?.trim() || existing.uom,
			uomCategory: nullable(input.uomCategory),
			preferredSupplierId: nullable(input.preferredSupplierId),

			reorderPoint: finiteOrNull(input.reorderPoint),
			minLevel: finiteOrNull(input.minLevel),
			maxLevel: finiteOrNull(input.maxLevel),
			leadTimeDays: intOrNull(input.leadTimeDays),
			lotControl: !!input.lotControl,
			serialControl: !!input.serialControl,
			shelfLifeDays: intOrNull(input.shelfLifeDays),

			valuationMethod: input.valuationMethod ?? existing.valuationMethod,
			standardCost: finiteOrNull(input.standardCost),
			lastCost: finiteOrNull(input.lastCost),
			averageCost: finiteOrNull(input.averageCost),
			currency: input.currency?.trim() || existing.currency,

			primaryImageUrl: nullable(input.primaryImageUrl) ?? primaryImage?.fileUrl ?? null,
			primaryBarcodeValue: primaryBarcode?.barcodeValue ?? null,
			primaryBarcodeType: primaryBarcode?.barcodeType ?? null,

			notes: nullable(input.notes)
		});

		await this.repo.deleteBarcodesByItem(id);
		await this.repo.deleteAttachmentsByItem(id);

		for (const b of barcodes) {
			await this.repo.addBarcode({
				id: b.id ?? crypto.randomUUID(),
				itemId: id,
				barcodeValue: b.barcodeValue.trim(),
				barcodeType: b.barcodeType ?? 'code128',
				packagingLevel: b.packagingLevel ?? 'each',
				isPrimary: !!b.isPrimary,
				notes: nullable(b.notes),
				createdAt: now,
				updatedAt: now
			});
		}

		for (const a of attachments) {
			await this.repo.addAttachment({
				id: a.id ?? crypto.randomUUID(),
				itemId: id,
				attachmentType: a.attachmentType ?? 'other',
				title: a.title.trim(),
				fileName: nullable(a.fileName),
				fileUrl: nullable(a.fileUrl),
				mimeType: nullable(a.mimeType),
				isPrimaryImage: !!a.isPrimaryImage,
				notes: nullable(a.notes),
				createdAt: now,
				updatedAt: now
			});
		}

		await this.audit.writeLog({
			action: 'inventory.item.updated',
			entityType: 'inventory_item',
			entityId: id,
			module: 'inventory',
			actionType: 'update',
			oldValue: { code: existing.code, name: existing.name },
			newValue: { code, name }
		});

		return { id };
	}

	async deleteItem(id: string) {
		const existing = await this.repo.findById(id);
		if (!existing) throw new NotFoundError('Item', id);
		await this.repo.softDelete(id);
		await this.audit.writeLog({
			action: 'inventory.item.deleted',
			entityType: 'inventory_item',
			entityId: id,
			module: 'inventory',
			actionType: 'delete',
			oldValue: { code: existing.code, name: existing.name }
		});
	}

	generateBarcode(itemCode: string) {
		return generateBarcodeValue(itemCode);
	}
}
