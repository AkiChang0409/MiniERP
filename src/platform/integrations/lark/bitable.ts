/**
 * Lark (Feishu) Bitable (多维表格) OpenAPI client — record create / search / update.
 *
 * Reuses `getTenantAccessToken` + `larkBaseUrl` from `./client` (no SDK, global
 * `fetch`). Used by Bitable-backed MiniERP flows to read/write records in the
 * shared Lark Base from the MiniERP backend (the "external server").
 *
 * IMPORTANT: the app (`LARK_APP_ID`) must be added as an editor/manager
 * collaborator on the target Base, otherwise reads return empty and writes fail.
 *
 * Field value formats vary by field type (see docs): single-select = text,
 * multi-select = string[], date = ms timestamp (number), person = { id }[],
 * link = { text, link } or a string[] of record_ids for relation fields.
 */

import { getTenantAccessToken, larkBaseUrl, larkWriteEnabled } from './client';

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

/** Resolve the shared Bitable Base app_token from env; throws if not configured. */
export function larkBitableAppToken(env: Env): string {
	const appToken = env.LARK_BITABLE_APP_TOKEN;
	if (!appToken) {
		throw new Error('LARK_BITABLE_APP_TOKEN is not configured');
	}
	return appToken;
}

/** Resolve the Doc Hub table target from env; throws if not configured. */
export function larkDocHubTarget(env: Env): { appToken: string; tableId: string } {
	const appToken = larkBitableAppToken(env);
	const tableId = env.LARK_DOCHUB_TABLE_ID;
	if (!tableId) {
		throw new Error('LARK_BITABLE_APP_TOKEN / LARK_DOCHUB_TABLE_ID are not configured');
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
	// Outbound WRITE kill-switch (default OFF): return a synthetic local record
	// instead of creating one in the company Base. Callers persist the mirror row
	// (D1) off this id, so domain writes still succeed locally.
	if (!larkWriteEnabled(env)) {
		console.log('[lark] writes disabled — skipping bitable record create');
		return { record_id: `local-${crypto.randomUUID()}`, fields: args.fields };
	}
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
	// Outbound WRITE kill-switch (default OFF): echo the requested fields back as
	// a synthetic success instead of mutating the company Base record.
	if (!larkWriteEnabled(env)) {
		console.log('[lark] writes disabled — skipping bitable record update');
		return { record_id: args.recordId, fields: args.fields };
	}
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
	// Outbound WRITE kill-switch (default OFF): return a synthetic file token so
	// upload-then-attach flows keep working without pushing bytes to Lark Drive.
	if (!larkWriteEnabled(env)) {
		console.log('[lark] writes disabled — skipping bitable media upload');
		return `local-${crypto.randomUUID()}`;
	}
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
	fieldId: string;
	name: string;
	type: number;
	/** Option labels for single/multi-select fields (empty otherwise). */
	options: string[];
	/** Raw Lark field property for table contracts/codecs that need type-specific metadata. */
	property: Record<string, unknown>;
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
			field_id?: string;
			field_name?: string;
			type?: number;
			property?: { options?: Array<{ name?: string }> } & Record<string, unknown>;
		}>;
	}>(
		env,
		`/open-apis/bitable/v1/apps/${enc(args.appToken)}/tables/${enc(args.tableId)}/fields?page_size=200`,
		{ method: 'GET' }
	);
	return (data.items ?? [])
		.map((f) => ({
			fieldId: f.field_id ?? '',
			name: f.field_name ?? '',
			type: f.type ?? 0,
			options: (f.property?.options ?? []).map((o) => o.name ?? '').filter(Boolean),
			property: f.property ?? {}
		}))
		.filter((f) => f.name);
}

/** Convenience: equality filter on one field (`field is value`). */
export function eqFilter(fieldName: string, value: string): BitableFilter {
	return { conjunction: 'and', conditions: [{ field_name: fieldName, operator: 'is', value: [value] }] };
}

/**
 * Pull ALL records of a table (follows pagination). Used by the sync engine.
 * Bitable search returns up to 500/page.
 */
export async function bitableListAllRecords(
	env: Env,
	args: { appToken: string; tableId: string; pageSize?: number }
): Promise<BitableRecord[]> {
	const all: BitableRecord[] = [];
	let pageToken: string | undefined;
	do {
		const res = await bitableSearchRecords(env, {
			appToken: args.appToken,
			tableId: args.tableId,
			pageSize: args.pageSize ?? 500,
			pageToken
		});
		all.push(...res.records);
		pageToken = res.hasMore ? res.pageToken : undefined;
	} while (pageToken);
	return all;
}

export interface BitableTableInfo {
	tableId: string;
	name: string;
	revision?: number;
}

/**
 * Bitable-attachment permission context for downloading attachment media.
 * Bitable-owned files require the `extra` query param on the Drive download
 * call (otherwise it 400s), carrying the owning table id + its current
 * revision. Build with `bitableTableRevision`.
 */
export interface BitableMediaPerm {
	tableId: string;
	rev: number;
}

/**
 * Download attachment bytes for a Bitable file_token. Attachment field values
 * come back from `bitableGetRecord`/`bitableSearchRecords` as
 * `[{ file_token, name, type, size }]` — no ready-to-fetch URL, so the actual
 * bytes need this separate Drive call.
 *
 * IMPORTANT for Bitable attachments: pass `perm` (the owning table id + rev).
 * The Drive media endpoint requires an `extra={"bitablePerm":{tableId,rev}}`
 * query param for base-owned files; without it Lark returns 400 Bad Request.
 * Docs: GET /open-apis/drive/v1/medias/{file_token}/download
 */
export async function bitableDownloadMedia(
	env: Env,
	fileToken: string,
	perm?: BitableMediaPerm
): Promise<{ bytes: Uint8Array; mimeType: string }> {
	const token = await getTenantAccessToken(env);
	let url = `${larkBaseUrl(env)}/open-apis/drive/v1/medias/${enc(fileToken)}/download`;
	if (perm) {
		const extra = JSON.stringify({ bitablePerm: { tableId: perm.tableId, rev: perm.rev } });
		url += `?extra=${enc(extra)}`;
	}
	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${token}` }
	});
	const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
	// Lark returns JSON only on error; a successful download is binary.
	if (!res.ok || contentType === 'application/json') {
		let detail = `${res.status} ${res.statusText}`;
		try {
			const body = (await res.json()) as { code?: number; msg?: string };
			detail = `code=${body.code} msg=${body.msg ?? 'unknown'}`;
		} catch {
			/* keep status detail */
		}
		throw new Error(`Lark media download failed: ${detail}`);
	}
	const bytes = new Uint8Array(await res.arrayBuffer());
	return { bytes, mimeType: contentType || 'application/octet-stream' };
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

/**
 * Current revision of one table (needed for the `bitablePerm` on attachment
 * media downloads). Resolved via the table list; returns undefined if the
 * table isn't found.
 */
export async function bitableTableRevision(
	env: Env,
	args: { appToken: string; tableId: string }
): Promise<number | undefined> {
	const tables = await bitableListTables(env, { appToken: args.appToken });
	return tables.find((t) => t.tableId === args.tableId)?.revision;
}
