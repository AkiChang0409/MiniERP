/**
 * QC intake — dropdown lookups (P1c).
 *
 * Reads the Projects + Business Partner tables from the shared Lark Base so the
 * PM send page can offer project / supplier pickers. Values are the Lark
 * `record_id` (which the signed token carries and which the Doc Hub link fields
 * are written with); labels come from the display fields.
 *
 * All three tables share one Base → the app_token is `LARK_DOCHUB_APP_TOKEN`;
 * each table has its own table_id env.
 */

import { bitableSearchRecords } from '$platform/integrations/lark/bitable';

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
	const token = env.LARK_DOCHUB_APP_TOKEN;
	if (!token) throw new Error('LARK_DOCHUB_APP_TOKEN is not configured');
	return token;
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

export async function listSuppliersForSend(env: Env): Promise<SupplierOption[]> {
	const appToken = baseAppToken(env);
	const tableId = env.LARK_SUPPLIER_TABLE_ID;
	if (!tableId) throw new Error('LARK_SUPPLIER_TABLE_ID is not configured');

	const out: SupplierOption[] = [];
	let pageToken: string | undefined;
	do {
		const res = await bitableSearchRecords(env, {
			appToken,
			tableId,
			fieldNames: ['Name', 'Email', 'Type', 'Email Domain'],
			pageSize: 200,
			pageToken
		});
		for (const r of res.records) {
			out.push({
				recordId: r.record_id,
				name: cellText(r.fields['Name']),
				email: cellText(r.fields['Email']),
				type: cellText(r.fields['Type']),
				emailDomain: cellText(r.fields['Email Domain'])
			});
		}
		pageToken = res.hasMore ? res.pageToken : undefined;
	} while (pageToken);
	// QC goes to suppliers; keep partners typed as supplier/both, else keep all
	// when Type is blank (avoids dropping records if the option label differs).
	const isSupplier = (t: string) => {
		const s = t.toLowerCase();
		return s.includes('supplier') || s.includes('both') || s.includes('供应');
	};
	const suppliers = out.filter((s) => !s.type || isSupplier(s.type));
	return suppliers.length ? suppliers : out;
}
