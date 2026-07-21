/**
 * QC intake — dropdown lookups (P1c).
 *
 * Reads the Projects + Business Partner tables from the shared Lark Base so the
 * PM send page can offer project / supplier pickers. Values are the Lark
 * `record_id` (which the signed token carries and which the Doc Hub link fields
 * are written with); labels come from the display fields.
 *
 * All three tables share one Base → the app_token is `LARK_BITABLE_APP_TOKEN`;
 * each table has its own table_id env.
 */

import { bitableSearchRecords, larkBitableAppToken } from '$platform/integrations/lark/bitable';

/** Flatten a Bitable cell value (text fields come back as strings or segment arrays). */
function cellText(v: unknown): string {
	if (v == null) return '';
	if (typeof v === 'string') return v;
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	if (Array.isArray(v)) return v.map(cellText).join('');
	if (typeof v === 'object') {
		const o = v as Record<string, unknown>;
		if (typeof o.text === 'string') return o.text;
		if (typeof o.name === 'string') return o.name; // single-select option shape
		return '';
	}
	return '';
}

function baseAppToken(env: Env): string {
	return larkBitableAppToken(env);
}

export interface ProjectOption {
	recordId: string;
	name: string;
	code: string;
}

export interface SupplierOption {
	recordId: string;
	name: string;
	email: string;
	type: string;
	emailDomain: string;
}

export async function listProjectsForSend(env: Env): Promise<ProjectOption[]> {
	const appToken = baseAppToken(env);
	const tableId = env.LARK_PROJECT_TABLE_ID;
	if (!tableId) throw new Error('LARK_PROJECT_TABLE_ID is not configured');

	const out: ProjectOption[] = [];
	let pageToken: string | undefined;
	do {
		const res = await bitableSearchRecords(env, {
			appToken,
			tableId,
			fieldNames: ['Project', 'Project Code'],
			pageSize: 200,
			pageToken
		});
		for (const r of res.records) {
			out.push({
				recordId: r.record_id,
				name: cellText(r.fields['Project']),
				code: cellText(r.fields['Project Code'])
			});
		}
		pageToken = res.hasMore ? res.pageToken : undefined;
	} while (pageToken);
	return out;
}

export interface DocClassification {
	/** Dictionary row record_id — written into the Doc Hub `File Type` link field. */
	recordId: string;
	/** Secondary Category (the "File Type"). */
	fileType: string;
	/** Primary Category. */
	category: string;
}

/**
 * Read the classification dictionary (one row per File Type, with its Category)
 * so the send page can offer a Category → File Type cascade. Not hardcoded —
 * driven by the `LARK_DICT_TABLE_ID` table's `Secondary Category` /
 * `Primary Category` fields.
 */
export async function listDocClassifications(env: Env): Promise<DocClassification[]> {
	const appToken = baseAppToken(env);
	const tableId = env.LARK_DICT_TABLE_ID;
	if (!tableId) throw new Error('LARK_DICT_TABLE_ID is not configured');

	// Tolerant field lookup (handles trailing spaces / case differences).
	const pick = (fields: Record<string, unknown>, name: string): unknown => {
		if (name in fields) return fields[name];
		const target = name.trim().toLowerCase();
		for (const k of Object.keys(fields)) if (k.trim().toLowerCase() === target) return fields[k];
		return undefined;
	};

	const out: DocClassification[] = [];
	let pageToken: string | undefined;
	let logged = false;
	do {
		// No field_names filter → return all fields so a name hair-difference can't
		// silently drop the columns; we match tolerantly below.
		const res = await bitableSearchRecords(env, { appToken, tableId, pageSize: 200, pageToken });
		if (!logged) {
			console.log(
				`[qc] dict rows=${res.records.length}; first-row fields: ${
					res.records[0] ? Object.keys(res.records[0].fields).join(' | ') : '(none)'
				}`
			);
			logged = true;
		}
		for (const r of res.records) {
			const fileType = cellText(pick(r.fields, 'Secondary Category'));
			const category = cellText(pick(r.fields, 'Primary Category'));
			if (fileType) out.push({ recordId: r.record_id, fileType, category });
		}
		pageToken = res.hasMore ? res.pageToken : undefined;
	} while (pageToken);
	return out;
}

export async function listSuppliersForSend(env: Env): Promise<SupplierOption[]> {
	const appToken = baseAppToken(env);
	const tableId = env.LARK_SUPPLIER_TABLE_ID;
	if (!tableId) throw new Error('LARK_SUPPLIER_TABLE_ID is not configured');

	// Tolerant field lookup (handles renames / trailing spaces / case differences).
	// The Business Partner table has NO `Type` field — supplier vs customer is
	// expressed via relations elsewhere — so we list all partners. Passing a rigid
	// field_names list here previously hard-failed with FieldNameNotFound (1254045)
	// whenever the Base was edited; fetch all fields and match tolerantly instead.
	const pick = (fields: Record<string, unknown>, name: string): unknown => {
		if (name in fields) return fields[name];
		const target = name.trim().toLowerCase();
		for (const k of Object.keys(fields)) if (k.trim().toLowerCase() === target) return fields[k];
		return undefined;
	};

	const out: SupplierOption[] = [];
	let pageToken: string | undefined;
	do {
		const res = await bitableSearchRecords(env, { appToken, tableId, pageSize: 200, pageToken });
		for (const r of res.records) {
			out.push({
				recordId: r.record_id,
				name: cellText(pick(r.fields, 'Name')),
				email: cellText(pick(r.fields, 'Email')),
				type: cellText(pick(r.fields, 'Type')),
				emailDomain: cellText(pick(r.fields, 'Email Domain'))
			});
		}
		pageToken = res.hasMore ? res.pageToken : undefined;
	} while (pageToken);
	return out;
}
