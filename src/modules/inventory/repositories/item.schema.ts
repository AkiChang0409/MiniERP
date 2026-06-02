import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { timeFields } from '$platform/modules/schema-helpers';
import { businessPartners } from '$modules/sales-crm/repositories/customer.schema';

export const items = sqliteTable(
	'items',
	{
		id: text('id').primaryKey(),
		code: text('code').notNull(),
		name: text('name').notNull(),
		description: text('description'),
		itemType: text('item_type', {
			enum: ['raw_material', 'finished_good', 'consumable', 'sub_assembly', 'service']
		})
			.notNull()
			.default('raw_material'),
		status: text('status', { enum: ['active', 'inactive', 'discontinued'] })
			.notNull()
			.default('active'),
		category: text('category'),
		uom: text('uom').notNull().default('unit'),
		uomCategory: text('uom_category'),

		preferredSupplierId: text('preferred_supplier_id').references(() => businessPartners.id),

		// Inventory parameters
		reorderPoint: real('reorder_point'),
		minLevel: real('min_level'),
		maxLevel: real('max_level'),
		leadTimeDays: integer('lead_time_days'),
		lotControl: integer('lot_control', { mode: 'boolean' }).notNull().default(false),
		serialControl: integer('serial_control', { mode: 'boolean' }).notNull().default(false),
		shelfLifeDays: integer('shelf_life_days'),

		// Valuation
		valuationMethod: text('valuation_method', {
			enum: ['fifo', 'weighted_average', 'standard_cost']
		})
			.notNull()
			.default('weighted_average'),
		standardCost: real('standard_cost'),
		lastCost: real('last_cost'),
		averageCost: real('average_cost'),
		currency: text('currency').notNull().default('SGD'),

		// Identification / media (primary surfaces; details live in child tables)
		primaryImageUrl: text('primary_image_url'),
		primaryBarcodeValue: text('primary_barcode_value'),
		primaryBarcodeType: text('primary_barcode_type'),

		notes: text('notes'),
		...timeFields
	},
	(table) => [
		uniqueIndex('idx_items_code_unique').on(table.code),
		index('idx_items_type').on(table.itemType),
		index('idx_items_status').on(table.status),
		index('idx_items_category').on(table.category),
		index('idx_items_supplier').on(table.preferredSupplierId)
	]
);

export const inventoryItemAttachments = sqliteTable(
	'inventory_item_attachments',
	{
		id: text('id').primaryKey(),
		itemId: text('item_id')
			.notNull()
			.references(() => items.id),
		attachmentType: text('attachment_type', {
			enum: ['image', 'datasheet', 'certificate', 'manual', 'safety_doc', 'other']
		})
			.notNull()
			.default('other'),
		title: text('title').notNull(),
		fileName: text('file_name'),
		fileUrl: text('file_url'),
		mimeType: text('mime_type'),
		isPrimaryImage: integer('is_primary_image', { mode: 'boolean' }).notNull().default(false),
		notes: text('notes'),
		...timeFields
	},
	(table) => [index('idx_inventory_item_attachments_item').on(table.itemId)]
);

export const inventoryItemBarcodes = sqliteTable(
	'inventory_item_barcodes',
	{
		id: text('id').primaryKey(),
		itemId: text('item_id')
			.notNull()
			.references(() => items.id),
		barcodeValue: text('barcode_value').notNull(),
		barcodeType: text('barcode_type', {
			enum: ['ean13', 'ean8', 'upc_a', 'code128', 'code39', 'qr', 'datamatrix', 'custom']
		})
			.notNull()
			.default('code128'),
		packagingLevel: text('packaging_level', { enum: ['each', 'inner', 'case', 'pallet'] })
			.notNull()
			.default('each'),
		isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
		notes: text('notes'),
		...timeFields
	},
	(table) => [
		uniqueIndex('idx_inventory_item_barcodes_value_unique').on(table.barcodeValue),
		index('idx_inventory_item_barcodes_item').on(table.itemId)
	]
);
