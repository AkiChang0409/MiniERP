import type { RequestHandler } from './$types';

import { fail, ok } from '$platform/http';
import {
	bitableListTables,
	bitableListFields,
	bitableSearchRecords
} from '$platform/integrations/lark/bitable';

/**
 * Owner/admin-only, READ-ONLY Bitable schema dump. Given a Base `appToken`, it
 * enumerates every table + its fields (field id / name / type / property /
 * select options) + a few sample records. Used to build the Bitable→D1 mapping
 * registry and table contracts.
 *
 * Requires: the Lark app (`LARK_APP_ID`) is a collaborator on the Base, and
 * `LARK_APP_ID`/`LARK_APP_SECRET` are configured (tenant token).
 *
 * Cloudflare caps subrequests per invocation (50 free / 1000 paid). The tenant
 * token is cached (one fetch), and this pages over tables (`limit`/`offset`) with
 * samples OFF by default, so one call stays well under the cap. If you see
 * "Too many subrequests", lower `limit` or page with `offset`.
 *
 * GET /api/admin/bitable/introspect?appToken=<t>&limit=30&offset=0&sample=0&table=<id?>
 */
const MAX_SAMPLE = 5;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 40;

export const GET: RequestHandler = async (event) => {
	if (!event.platform) return fail('Cloudflare platform bindings are required', 500);
	const user = event.locals.user;
	if (!user) return fail('Unauthorized', 401);
	if (!user.roles.some((r) => r === 'owner' || r === 'admin')) {
		return fail('Forbidden — owner/admin only', 403);
	}

	const q = event.url.searchParams;
	const appToken = q.get('appToken')?.trim();
	if (!appToken) return fail('Missing appToken', 400);
	const onlyTable = q.get('table')?.trim() || null;
	const sample = Math.min(MAX_SAMPLE, Math.max(0, Number.parseInt(q.get('sample') ?? '0', 10) || 0));
	const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(q.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
	const offset = Math.max(0, Number.parseInt(q.get('offset') ?? '0', 10) || 0);

	const env = event.platform.env;

	try {
		const allTables = await bitableListTables(env, { appToken });
		const selected = onlyTable
			? allTables.filter((t) => t.tableId === onlyTable)
			: allTables.slice(offset, offset + limit);

		const out = [];
		for (const table of selected) {
			const fields = await bitableListFields(env, { appToken, tableId: table.tableId });
			let records: unknown[] = [];
			if (sample > 0) {
				const res = await bitableSearchRecords(env, {
					appToken,
					tableId: table.tableId,
					pageSize: sample
				});
				records = res.records.slice(0, sample);
			}
			out.push({ tableId: table.tableId, name: table.name, fields, sample: records });
		}

		const nextOffset = onlyTable ? null : offset + selected.length;
		return ok({
			appToken,
			tableCount: allTables.length,
			returned: out.length,
			offset,
			nextOffset: !onlyTable && nextOffset! < allTables.length ? nextOffset : null,
			tableNames: allTables.map((t) => t.name),
			tables: out
		});
	} catch (err) {
		return fail(err instanceof Error ? err.message : 'Bitable introspection failed', 502);
	}
};
