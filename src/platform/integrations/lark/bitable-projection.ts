/**
 * Typed Bitable projection primitives (B5 — read-from-Bitable foundation).
 *
 * The B5 standard for "read a domain from the Bitable mirror as a typed DTO" is
 * an **in-memory repository**: read the table's mirror records
 * (`readBitableRecords`), map each raw record into a domain DTO, and filter/sort
 * in the domain repository. These two helpers extract the common read + link-
 * index scaffolding so each domain writes only its `map` function (+ any
 * filter/sort), instead of copy-pasting the read loop.
 *
 * Reference implementation: `src/modules/sales-crm/customer-source.ts`
 * (`BitableCustomerRepository`). Later domains (project / inventory / finance)
 * follow the same shape.
 */
import type { DBClient } from '$infrastructure/db';
import { readBitableRecords } from './bitable-read';

/** Map a mirror record (recordId + parsed fields) into a domain DTO. */
export type BitableRecordMapper<T> = (recordId: string, fields: Record<string, unknown>) => T;

/**
 * Load every (non-deleted) mirror record for a table and map each into a DTO.
 * Filtering/sorting stays in the caller — that is domain semantics.
 */
export async function loadBitableProjection<T>(
	db: DBClient,
	tableId: string,
	map: BitableRecordMapper<T>
): Promise<T[]> {
	const records = await readBitableRecords(db, tableId);
	return records.map((r) => map(r.recordId, r.fields));
}

/**
 * Load a table into a `recordId → DTO` index — for resolving linked-record
 * fields (Bitable relations store the linked table's record ids). E.g. resolve a
 * Business Partner's `Contact Person` link ids against the contact-person index.
 */
export async function loadBitableLinkIndex<T>(
	db: DBClient,
	tableId: string,
	map: BitableRecordMapper<T>
): Promise<Map<string, T>> {
	const records = await readBitableRecords(db, tableId);
	return new Map(records.map((r) => [r.recordId, map(r.recordId, r.fields)]));
}
