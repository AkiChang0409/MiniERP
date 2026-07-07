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

/** Convenience: equality filter on one field (`field is value`). */
export function eqFilter(fieldName: string, value: string): BitableFilter {
	return { conjunction: 'and', conditions: [{ field_name: fieldName, operator: 'is', value: [value] }] };
}
