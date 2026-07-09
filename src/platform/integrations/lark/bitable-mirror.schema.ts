import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Generic raw mirror of Lark Bitable records (Bitable-as-source-of-truth sync).
 *
 * Every synced record from every table lands here as JSON — schema-agnostic and
 * resilient to Bitable field changes. Typed per-domain projections (`bt_*`) are
 * derived from this. Primary key is `${tableId}:${recordId}` so a re-sync upserts
 * cleanly. Soft delete via `deleted` + a `synced_at` watermark (records not
 * touched by the latest run for their table are marked deleted).
 */
export const bitableRecords = sqliteTable(
	'bitable_records',
	{
		/** `${tableId}:${recordId}` */
		id: text('id').primaryKey(),
		baseToken: text('base_token').notNull(),
		tableId: text('table_id').notNull(),
		tableName: text('table_name').notNull().default(''),
		recordId: text('record_id').notNull(),
		/** Raw Bitable `fields` object, JSON-stringified. */
		fields: text('fields').notNull().default('{}'),
		larkCreatedTime: integer('lark_created_time'),
		larkLastModified: integer('lark_last_modified'),
		/** ISO timestamp of the sync run that last touched this row (watermark). */
		syncedAt: text('synced_at').notNull().default(sql`CURRENT_TIMESTAMP`),
		deleted: integer('deleted').notNull().default(0)
	},
	(t) => [index('bitable_records_table_idx').on(t.tableId)]
);
