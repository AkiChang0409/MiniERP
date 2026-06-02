import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { timeFields } from '$platform/modules/schema-helpers';
import { items } from './item.schema';

export const warehouses = sqliteTable(
	'warehouses',
	{
		id: text('id').primaryKey(),
		code: text('code').notNull(),
		name: text('name').notNull(),
		status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),

		addressLine1: text('address_line1'),
		addressLine2: text('address_line2'),
		city: text('city'),
		state: text('state'),
		postalCode: text('postal_code'),
		country: text('country').notNull().default('Singapore'),

		contactName: text('contact_name'),
		contactPhone: text('contact_phone'),
		contactEmail: text('contact_email'),

		notes: text('notes'),
		...timeFields
	},
	(table) => [
		uniqueIndex('idx_warehouses_code_unique').on(table.code),
		index('idx_warehouses_status').on(table.status)
	]
);

export const warehouseBinLocations = sqliteTable(
	'warehouse_bin_locations',
	{
		id: text('id').primaryKey(),
		warehouseId: text('warehouse_id')
			.notNull()
			.references(() => warehouses.id),
		code: text('code').notNull(),
		name: text('name'),
		locationType: text('location_type', {
			enum: [
				'raw_material',
				'wip',
				'finished_goods',
				'quarantine',
				'picking',
				'shipping',
				'staging',
				'general'
			]
		})
			.notNull()
			.default('general'),
		aisle: text('aisle'),
		rack: text('rack'),
		shelf: text('shelf'),
		bin: text('bin'),
		barcode: text('barcode'),
		isPickable: integer('is_pickable', { mode: 'boolean' }).notNull().default(true),
		isReceivable: integer('is_receivable', { mode: 'boolean' }).notNull().default(true),
		isDefaultPutaway: integer('is_default_putaway', { mode: 'boolean' }).notNull().default(false),
		status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
		notes: text('notes'),
		...timeFields
	},
	(table) => [
		uniqueIndex('idx_warehouse_bins_wh_code_unique').on(table.warehouseId, table.code),
		index('idx_warehouse_bins_warehouse').on(table.warehouseId),
		index('idx_warehouse_bins_type').on(table.locationType),
		uniqueIndex('idx_warehouse_bins_barcode_unique').on(table.barcode)
	]
);

export const inventoryStockLevels = sqliteTable(
	'inventory_stock_levels',
	{
		id: text('id').primaryKey(),
		itemId: text('item_id')
			.notNull()
			.references(() => items.id),
		warehouseId: text('warehouse_id')
			.notNull()
			.references(() => warehouses.id),
		binLocationId: text('bin_location_id')
			.notNull()
			.references(() => warehouseBinLocations.id),
		quantityOnHand: real('quantity_on_hand').notNull().default(0),
		quantityReserved: real('quantity_reserved').notNull().default(0),
		quantityIncoming: real('quantity_incoming').notNull().default(0),
		unitCost: real('unit_cost'),
		lastMovementAt: text('last_movement_at'),
		...timeFields
	},
	(table) => [
		uniqueIndex('idx_inventory_stock_levels_unique').on(
			table.itemId,
			table.warehouseId,
			table.binLocationId
		),
		index('idx_inventory_stock_levels_item').on(table.itemId),
		index('idx_inventory_stock_levels_bin').on(table.binLocationId)
	]
);

export const inventoryStockMovements = sqliteTable(
	'inventory_stock_movements',
	{
		id: text('id').primaryKey(),
		itemId: text('item_id')
			.notNull()
			.references(() => items.id),
		warehouseId: text('warehouse_id')
			.notNull()
			.references(() => warehouses.id),
		binLocationId: text('bin_location_id')
			.notNull()
			.references(() => warehouseBinLocations.id),
		movementType: text('movement_type', {
			enum: [
				'opening_balance',
				'receipt',
				'issue',
				'transfer_out',
				'transfer_in',
				'adjustment',
				'scrap',
				'cycle_count'
			]
		}).notNull(),
		reasonCode: text('reason_code'),
		quantityDelta: real('quantity_delta').notNull(),
		quantityAfter: real('quantity_after').notNull(),
		unitCost: real('unit_cost'),
		valueDelta: real('value_delta'),
		referenceType: text('reference_type'),
		referenceId: text('reference_id'),
		physicalCountDocumentRef: text('physical_count_document_ref'),
		iaAlertCode: text('ia_alert_code'),
		performedByUserId: text('performed_by_user_id'),
		performedByEmail: text('performed_by_email'),
		notes: text('notes'),
		// Movements are append-only audit; createdAt/updatedAt; no deletedAt.
		createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
		updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
	},
	(table) => [
		index('idx_inventory_stock_movements_item').on(table.itemId),
		index('idx_inventory_stock_movements_warehouse').on(table.warehouseId),
		index('idx_inventory_stock_movements_bin').on(table.binLocationId),
		index('idx_inventory_stock_movements_ref').on(table.referenceType, table.referenceId),
		index('idx_inventory_stock_movements_created').on(table.createdAt)
	]
);

export const inventoryStockTransfers = sqliteTable(
	'inventory_stock_transfers',
	{
		id: text('id').primaryKey(),
		transferNumber: text('transfer_number').notNull(),
		status: text('status', { enum: ['draft', 'in_transit', 'completed', 'cancelled'] })
			.notNull()
			.default('draft'),
		sourceWarehouseId: text('source_warehouse_id')
			.notNull()
			.references(() => warehouses.id),
		destWarehouseId: text('dest_warehouse_id')
			.notNull()
			.references(() => warehouses.id),
		requestedAt: text('requested_at'),
		shippedAt: text('shipped_at'),
		receivedAt: text('received_at'),
		performedByUserId: text('performed_by_user_id'),
		performedByEmail: text('performed_by_email'),
		notes: text('notes'),
		...timeFields
	},
	(table) => [
		uniqueIndex('idx_inventory_stock_transfers_number_unique').on(table.transferNumber),
		index('idx_inventory_stock_transfers_status').on(table.status),
		index('idx_inventory_stock_transfers_source').on(table.sourceWarehouseId),
		index('idx_inventory_stock_transfers_dest').on(table.destWarehouseId)
	]
);

export const inventoryStockTransferLines = sqliteTable(
	'inventory_stock_transfer_lines',
	{
		id: text('id').primaryKey(),
		transferId: text('transfer_id')
			.notNull()
			.references(() => inventoryStockTransfers.id),
		itemId: text('item_id')
			.notNull()
			.references(() => items.id),
		sourceBinId: text('source_bin_id')
			.notNull()
			.references(() => warehouseBinLocations.id),
		destBinId: text('dest_bin_id')
			.notNull()
			.references(() => warehouseBinLocations.id),
		quantityRequested: real('quantity_requested').notNull().default(0),
		quantityShipped: real('quantity_shipped').notNull().default(0),
		quantityReceived: real('quantity_received').notNull().default(0),
		notes: text('notes'),
		...timeFields
	},
	(table) => [
		index('idx_inventory_stock_transfer_lines_transfer').on(table.transferId),
		index('idx_inventory_stock_transfer_lines_item').on(table.itemId)
	]
);

// Cycle counts (INV003) — count session header.
export const inventoryCycleCounts = sqliteTable(
	'inventory_cycle_counts',
	{
		id: text('id').primaryKey(),
		countNumber: text('count_number').notNull(),
		warehouseId: text('warehouse_id')
			.notNull()
			.references(() => warehouses.id),
		status: text('status', { enum: ['draft', 'counting', 'posted', 'cancelled'] })
			.notNull()
			.default('draft'),
		countType: text('count_type', { enum: ['cycle_count', 'full_physical'] })
			.notNull()
			.default('cycle_count'),
		scheduledAt: text('scheduled_at'),
		countedAt: text('counted_at'),
		postedAt: text('posted_at'),
		performedByUserId: text('performed_by_user_id'),
		performedByEmail: text('performed_by_email'),
		approvedByUserId: text('approved_by_user_id'),
		approvedByEmail: text('approved_by_email'),
		documentRef: text('document_ref'),
		notes: text('notes'),
		...timeFields
	},
	(table) => [
		uniqueIndex('idx_inventory_cycle_counts_number_unique').on(table.countNumber),
		index('idx_inventory_cycle_counts_status').on(table.status),
		index('idx_inventory_cycle_counts_warehouse').on(table.warehouseId)
	]
);

export const inventoryCycleCountLines = sqliteTable(
	'inventory_cycle_count_lines',
	{
		id: text('id').primaryKey(),
		cycleCountId: text('cycle_count_id')
			.notNull()
			.references(() => inventoryCycleCounts.id),
		itemId: text('item_id')
			.notNull()
			.references(() => items.id),
		binLocationId: text('bin_location_id')
			.notNull()
			.references(() => warehouseBinLocations.id),
		expectedQuantity: real('expected_quantity').notNull().default(0),
		countedQuantity: real('counted_quantity'),
		variance: real('variance'),
		unitCost: real('unit_cost'),
		varianceValue: real('variance_value'),
		movementId: text('movement_id'),
		notes: text('notes'),
		...timeFields
	},
	(table) => [
		index('idx_inventory_cycle_count_lines_count').on(table.cycleCountId),
		index('idx_inventory_cycle_count_lines_item').on(table.itemId)
	]
);
