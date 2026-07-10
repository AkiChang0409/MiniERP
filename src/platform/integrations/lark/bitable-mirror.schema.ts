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

/**
 * Append-only audit trail for MiniERP-initiated Lark writes.
 *
 * Lark remains the source of truth; this table records what MiniERP attempted
 * and the Lark record id/result it received so D1 can serve backup/audit needs
 * without becoming the business source.
 */
export const larkWriteOperations = sqliteTable(
	'lark_write_operations',
	{
		id: text('id').primaryKey(),
		appToken: text('app_token').notNull(),
		tableId: text('table_id').notNull(),
		tableName: text('table_name').notNull().default(''),
		recordId: text('record_id'),
		operation: text('operation').notNull(),
		status: text('status').notNull(),
		payload: text('payload').notNull().default('{}'),
		result: text('result').notNull().default('{}'),
		error: text('error'),
		sourceModule: text('source_module').notNull().default(''),
		sourceAction: text('source_action').notNull().default(''),
		actorUserId: text('actor_user_id'),
		createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
	},
	(t) => [
		index('lark_write_operations_table_idx').on(t.tableId),
		index('lark_write_operations_record_idx').on(t.recordId),
		index('lark_write_operations_created_idx').on(t.createdAt)
	]
);
