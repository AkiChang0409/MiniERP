/**
 * Lark (Feishu) Bitable (多维表格) OpenAPI client — record create / search / update.
 *
 * Reuses `getTenantAccessToken` + `larkBaseUrl` from `./client` (no SDK, global
 * `fetch`). Used by the Doc Hub / QC intake flow to write records into a Lark
 * Base from the MiniERP backend (the "external server").
 *
 * IMPORTANT: the app (`LARK_APP_ID`) must be added as an editor/manager
 * collaborator on the target Base, otherwise reads return empty and writes fail.
 *
 * Field value formats vary by field type (see docs): single-select = text,
 * multi-select = string[], date = ms timestamp (number), person = { id }[],
 * link = { text, link } or a string[] of record_ids for relation fields.
 */

import { getTenantAccessToken, larkBaseUrl } from './client';

export type BitableFields = Record<string, unknown>;

export interface BitableRecord {
	record_id: string;
	fields: BitableFields;
}

/** A single search condition (Lark-native shape). */
export interface BitableFilterCondition {
	field_name: string;
	operator: 'is' | 'isNot' | 'contains' | 'doesNotContain' | 'isEmpty' | 'isNotEmpty';
	value?: string[];
}

export interface BitableFilter {
	conjunction: 'and' | 'or';
	conditions: BitableFilterCondition[];
}

interface BitableEnvelope<T> {
	code: number;
	msg?: string;
	data?: T;
}

const enc = encodeURIComponent;

/** Shared authorized call to the Bitable API; throws on a non-zero Lark code. */
async function bitableCall<T>(env: Env, path: string, init: RequestInit): Promise<T> {
	const token = await getTenantAccessToken(env);
	const res = await fetch(`${larkBaseUrl(env)}${path}`, {
		...init,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			Authorization: `Bearer ${token}`,
			...(init.headers ?? {})
		}
	});
	const data = (await res.json()) as BitableEnvelope<T>;
	if (data.code !== 0) {
		throw new Error(`Lark bitable ${path} failed: code=${data.code} msg=${data.msg ?? 'unknown'}`);
	}
	return data.data as T;
}

/** Resolve the Doc Hub Base target from env; throws if not configured. */
export function larkDocHubTarget(env: Env): { appToken: string; tableId: string } {
	const appToken = env.LARK_DOCHUB_APP_TOKEN;
	const tableId = env.LARK_DOCHUB_TABLE_ID;
	if (!appToken || !tableId) {
		throw new Error('LARK_DOCHUB_APP_TOKEN / LARK_DOCHUB_TABLE_ID are not configured');
	}
	return { appToken, tableId };
}

/**
 * Create a single record.
 * Docs: POST /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records (10 QPS)
 */
export async function bitableCreateRecord(
	env: Env,
	args: { appToken: string; tableId: string; fields: BitableFields }
): Promise<BitableRecord> {
	const data = await bitableCall<{ record: BitableRecord }>(
		env,
		`/open-apis/bitable/v1/apps/${enc(args.appToken)}/tables/${enc(args.tableId)}/records`,
		{ method: 'POST', body: JSON.stringify({ fields: args.fields }) }
	);
	return data.record;
}

/**
 * Update a single record's fields.
 * Docs: PUT /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/{record_id}
 */
export async function bitableUpdateRecord(
	env: Env,
	args: { appToken: string; tableId: string; recordId: string; fields: BitableFields }
): Promise<BitableRecord> {
	const data = await bitableCall<{ record: BitableRecord }>(
		env,
		`/open-apis/bitable/v1/apps/${enc(args.appToken)}/tables/${enc(args.tableId)}/records/${enc(
			args.recordId
		)}`,
		{ method: 'PUT', body: JSON.stringify({ fields: args.fields }) }
	);
	return data.record;
}

/**
 * Get a single record by id.
 * Docs: GET /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/{record_id}
 */
export async function bitableGetRecord(
	env: Env,
	args: { appToken: string; tableId: string; recordId: string }
): Promise<BitableRecord> {
	const data = await bitableCall<{ record: BitableRecord }>(
		env,
		`/open-apis/bitable/v1/apps/${enc(args.appToken)}/tables/${enc(args.tableId)}/records/${enc(
			args.recordId
		)}`,
		{ method: 'GET' }
	);
	return data.record;
}

/**
 * Search records (up to 500/page, with an optional native filter).
 * Docs: POST /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/search
 * Pass `pageToken` from a previous call to page; `hasMore` signals more pages.
 */
export async function bitableSearchRecords(
	env: Env,
	args: {
		appToken: string;
		tableId: string;
		filter?: BitableFilter;
		fieldNames?: string[];
		pageSize?: number;
		pageToken?: string;
	}
): Promise<{ records: BitableRecord[]; hasMore: boolean; pageToken?: string }> {
	const qs = new URLSearchParams({ page_size: String(args.pageSize ?? 100) });
	if (args.pageToken) qs.set('page_token', args.pageToken);
	const body: Record<string, unknown> = {};
	if (args.filter) body.filter = args.filter;
	if (args.fieldNames) body.field_names = args.fieldNames;

	const data = await bitableCall<{
		items?: BitableRecord[];
		has_more?: boolean;
		page_token?: string;
	}>(
		env,
		`/open-apis/bitable/v1/apps/${enc(args.appToken)}/tables/${enc(
			args.tableId
		)}/records/search?${qs.toString()}`,
		{ method: 'POST', body: JSON.stringify(body) }
	);
	return {
		records: data.items ?? [],
		hasMore: Boolean(data.has_more),
		pageToken: data.page_token
	};
}

/**
 * Upload a file as Bitable attachment media → returns a `file_token`.
 * Two-step attachment flow: upload here, then write `[{ file_token }]` into the
 * attachment field via create/update record.
 * Docs: POST /open-apis/drive/v1/medias/upload_all (multipart/form-data, <20MB).
 * Scope: one of [bitable:app, drive:drive, …] — bitable:app suffices.
 */
export async function bitableUploadMedia(
	env: Env,
	args: { appToken: string; fileName: string; mimeType: string; bytes: Uint8Array }
): Promise<string> {
	const token = await getTenantAccessToken(env);
	const fd = new FormData();
	fd.append('file_name', args.fileName);
	fd.append('parent_type', 'bitable_file');
	fd.append('parent_node', args.appToken);
	fd.append('size', String(args.bytes.length));
	// Uint8Array is a valid BlobPart at runtime; cast around the strict lib type.
	fd.append('file', new Blob([args.bytes as unknown as BlobPart], { type: args.mimeType }), args.fileName);

	// No manual Content-Type — fetch sets the multipart boundary.
	const res = await fetch(`${larkBaseUrl(env)}/open-apis/drive/v1/medias/upload_all`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}` },
		body: fd
	});
	const data = (await res.json()) as BitableEnvelope<{ file_token?: string }>;
	if (data.code !== 0 || !data.data?.file_token) {
		throw new Error(`Lark upload_all failed: code=${data.code} msg=${data.msg ?? 'unknown'}`);
	}
	return data.data.file_token;
}

/**
 * List a table's field names (for validating a write payload against the real
 * schema before create/update).
 * Docs: GET /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/fields
 */
export async function bitableListFieldNames(
	env: Env,
	args: { appToken: string; tableId: string }
): Promise<string[]> {
	const data = await bitableCall<{ items?: Array<{ field_name?: string }> }>(
		env,
		`/open-apis/bitable/v1/apps/${enc(args.appToken)}/tables/${enc(args.tableId)}/fields?page_size=200`,
		{ method: 'GET' }
	);
	return (data.items ?? []).map((f) => f.field_name ?? '').filter(Boolean);
}

export interface BitableFieldDef {
	name: string;
	type: number;
	/** Option labels for single/multi-select fields (empty otherwise). */
	options: string[];
}

/**
 * List a table's fields with their single/multi-select option labels — used to
 * populate card dropdowns (Category / File Type) from the real schema.
 * Docs: GET /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/fields
 */
export async function bitableListFields(
	env: Env,
	args: { appToken: string; tableId: string }
): Promise<BitableFieldDef[]> {
	const data = await bitableCall<{
		items?: Array<{
			field_name?: string;
			type?: number;
			property?: { options?: Array<{ name?: string }> };
		}>;
	}>(
		env,
		`/open-apis/bitable/v1/apps/${enc(args.appToken)}/tables/${enc(args.tableId)}/fields?page_size=200`,
		{ method: 'GET' }
	);
	return (data.items ?? [])
		.map((f) => ({
			name: f.field_name ?? '',
			type: f.type ?? 0,
			options: (f.property?.options ?? []).map((o) => o.name ?? '').filter(Boolean)
		}))
		.filter((f) => f.name);
}

/** Convenience: equality filter on one field (`field is value`). */
export function eqFilter(fieldName: string, value: string): BitableFilter {
	return { conjunction: 'and', conditions: [{ field_name: fieldName, operator: 'is', value: [value] }] };
}

export interface BitableTableInfo {
	tableId: string;
	name: string;
	revision?: number;
}

/**
 * List all tables in a Base.
 * Docs: GET /open-apis/bitable/v1/apps/{app_token}/tables (paged).
 */
export async function bitableListTables(
	env: Env,
	args: { appToken: string }
): Promise<BitableTableInfo[]> {
	const out: BitableTableInfo[] = [];
	let pageToken: string | undefined;
	do {
		const qs = new URLSearchParams({ page_size: '100' });
		if (pageToken) qs.set('page_token', pageToken);
		const data = await bitableCall<{
			items?: Array<{ table_id?: string; name?: string; revision?: number }>;
			has_more?: boolean;
			page_token?: string;
		}>(
			env,
			`/open-apis/bitable/v1/apps/${enc(args.appToken)}/tables?${qs.toString()}`,
			{ method: 'GET' }
		);
		for (const t of data.items ?? []) {
			if (t.table_id) out.push({ tableId: t.table_id, name: t.name ?? '', revision: t.revision });
		}
		pageToken = data.has_more ? data.page_token : undefined;
	} while (pageToken);
	return out;
}
