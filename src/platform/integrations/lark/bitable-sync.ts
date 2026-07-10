/**
 * Bitable → D1 pull sync engine (Bitable-as-source-of-truth).
 *
 * Generic + module-agnostic: given a Base app_token + table, it pulls every
 * record and upserts into the raw mirror `bitable_records`, then soft-deletes
 * rows this run didn't touch (via a `synced_at` watermark — no IN-list, so it
 * scales past SQLite's variable limit). Typed `bt_*` projections derive from the
 * mirror in a later step. D1 writes are not subrequests; only the Lark pulls are,
 * so a run's subrequest cost is ≈ number of record pages.
 */
import { and, eq, lt } from 'drizzle-orm';
import type { DBClient } from '$infrastructure/db';
import { bitableListAllRecords } from './bitable';
import type { BitableRecord } from './bitable';
import { bitableRecords } from './bitable-mirror.schema';

export interface SyncTableResult {
	tableId: string;
	tableName: string;
	pulled: number;
	softDeleted: number;
}

const UPSERT_CHUNK = 50;

export async function upsertBitableMirrorRecord(
	db: DBClient,
	args: {
		appToken: string;
		tableId: string;
		tableName: string;
		record: BitableRecord;
		syncedAt?: string;
	}
): Promise<void> {
	const syncedAt = args.syncedAt ?? new Date().toISOString();
	const fields = JSON.stringify(args.record.fields ?? {});
	await db
		.insert(bitableRecords)
		.values({
			id: `${args.tableId}:${args.record.record_id}`,
			baseToken: args.appToken,
			tableId: args.tableId,
			tableName: args.tableName,
			recordId: args.record.record_id,
			fields,
			syncedAt,
			deleted: 0
		})
		.onConflictDoUpdate({
			target: bitableRecords.id,
			set: { fields, tableName: args.tableName, syncedAt, deleted: 0 }
		});
}

export async function syncBitableTable(
	env: Env,
	db: DBClient,
	args: { appToken: string; tableId: string; tableName: string }
): Promise<SyncTableResult> {
	const records = await bitableListAllRecords(env, {
		appToken: args.appToken,
		tableId: args.tableId
	});
	const runTs = new Date().toISOString();

	// Upsert in chunks via db.batch (fewer round-trips than per-row awaits).
	for (let i = 0; i < records.length; i += UPSERT_CHUNK) {
		const chunk = records.slice(i, i + UPSERT_CHUNK);
		const stmts = chunk.map((r) =>
			db
				.insert(bitableRecords)
				.values({
					id: `${args.tableId}:${r.record_id}`,
					baseToken: args.appToken,
					tableId: args.tableId,
					tableName: args.tableName,
					recordId: r.record_id,
					fields: JSON.stringify(r.fields ?? {}),
					syncedAt: runTs,
					deleted: 0
				})
				.onConflictDoUpdate({
					target: bitableRecords.id,
					set: {
						fields: JSON.stringify(r.fields ?? {}),
						tableName: args.tableName,
						syncedAt: runTs,
						deleted: 0
					}
				})
		);
		if (stmts.length === 1) await stmts[0];
		else if (stmts.length > 1) await db.batch(stmts as [typeof stmts[0], ...(typeof stmts)]);
	}

	// Soft-delete rows not touched this run (watermark: synced_at < runTs).
	const del = await db
		.update(bitableRecords)
		.set({ deleted: 1, syncedAt: runTs })
		.where(
			and(
				eq(bitableRecords.tableId, args.tableId),
				eq(bitableRecords.deleted, 0),
				lt(bitableRecords.syncedAt, runTs)
			)
		);
	const softDeleted = (del as unknown as { meta?: { changes?: number } })?.meta?.changes ?? 0;

	return { tableId: args.tableId, tableName: args.tableName, pulled: records.length, softDeleted };
}

export async function syncBitableTables(
	env: Env,
	db: DBClient,
	appToken: string,
	tables: ReadonlyArray<{ tableId: string; name: string }>
): Promise<SyncTableResult[]> {
	const results: SyncTableResult[] = [];
	for (const t of tables) {
		results.push(await syncBitableTable(env, db, { appToken, tableId: t.tableId, tableName: t.name }));
	}
	return results;
}
