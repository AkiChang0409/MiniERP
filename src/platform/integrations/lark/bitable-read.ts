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
	if (value == null) return null;
	if (typeof value === 'string') return value.trim() || null;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (Array.isArray(value)) {
		const parts = value
			.map((x) =>
				typeof x === 'string'
					? x
					: x && typeof x === 'object' && 'text' in x
						? String((x as { text?: unknown }).text ?? '')
						: ''
			)
			.filter(Boolean);
		return parts.join(', ').trim() || null;
	}
	if (typeof value === 'object' && 'text' in value) {
		return String((value as { text?: unknown }).text ?? '').trim() || null;
	}
	return null;
}
