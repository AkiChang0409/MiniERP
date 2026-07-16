/**
 * Read helpers over the Bitable raw mirror (`bitable_records`). Modules use these
 * (module → platform is allowed) to project a synced Bitable table into their own
 * typed shape behind their `createXApi` facade — the Bitable-as-source-of-truth
 * read path. `bitableText` normalizes a Bitable field value (which may be a
 * string, number, rich-text segment array, or `{text}` object) into a plain
 * string.
 */
import { and, eq } from 'drizzle-orm';
import type { DBClient } from '$infrastructure/db';
import { bitableRecords } from './bitable-mirror.schema';
import { bitablePlainText } from './bitable-field-codec';

export interface MirrorRecord {
	recordId: string;
	fields: Record<string, unknown>;
}

/** All non-deleted mirror records for one Bitable table, with `fields` parsed. */
export async function readBitableRecords(db: DBClient, tableId: string): Promise<MirrorRecord[]> {
	const rows = await db
		.select({ recordId: bitableRecords.recordId, fields: bitableRecords.fields })
		.from(bitableRecords)
		.where(and(eq(bitableRecords.tableId, tableId), eq(bitableRecords.deleted, 0)));
	return rows.map((r) => {
		let fields: Record<string, unknown> = {};
		try {
			fields = JSON.parse(r.fields) as Record<string, unknown>;
		} catch {
			/* keep empty */
		}
		return { recordId: r.recordId, fields };
	});
}

/** Extract a plain string from a Bitable field value; null when empty. */
export function bitableText(value: unknown): string | null {
	return bitablePlainText(value);
}

export interface NormalizedMirrorRecord {
	recordId: string;
	name: string | null;
	fields: Record<string, string>;
}

/**
 * Normalize a mirror record into `{ recordId, name, fields }` with every field
 * value flattened to plain text. `nameCandidates` picks a human-readable name
 * (first matching field), falling back to the first non-empty field. Shared by
 * the domains' raw Bitable read tools (P3 read-from-Bitable) so they don't each
 * reimplement the flattening.
 */
export function normalizeMirrorRecord(
	record: MirrorRecord,
	nameCandidates: readonly string[]
): NormalizedMirrorRecord {
	const fields: Record<string, string> = {};
	for (const [fieldName, value] of Object.entries(record.fields)) {
		const text = bitablePlainText(value);
		if (text) fields[fieldName] = text;
	}
	let name: string | null = null;
	for (const candidate of nameCandidates) {
		if (fields[candidate]) {
			name = fields[candidate];
			break;
		}
	}
	if (!name) name = Object.values(fields)[0] ?? null;
	return { recordId: record.recordId, name, fields };
}
