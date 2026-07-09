import type { RequestHandler } from './$types';

import { fail, ok } from '$platform/http';
import {
	bitableListTables,
	bitableListFields,
	bitableSearchRecords
} from '$platform/integrations/lark/bitable';

/**
 * Owner/admin-only, READ-ONLY Bitable schema dump. Given a Base `appToken`, it
 * enumerates every table + its fields (name / type / select options) + a few
 * sample records. Used to build the Bitable→D1 mapping registry (plan Phase A).
 *
 * Requires: the Lark app (`LARK_APP_ID`) is a collaborator on the Base, and
 * `LARK_APP_ID`/`LARK_APP_SECRET` are configured (tenant token).
 *
 * GET /api/admin/bitable/introspect?appToken=<token>&sample=<n>
 */
const MAX_SAMPLE = 5;

export const GET: RequestHandler = async (event) => {
	if (!event.platform) return fail('Cloudflare platform bindings are required', 500);
	const user = event.locals.user;
	if (!user) return fail('Unauthorized', 401);
	if (!user.roles.some((r) => r === 'owner' || r === 'admin')) {
		return fail('Forbidden — owner/admin only', 403);
	}

	const appToken = event.url.searchParams.get('appToken')?.trim();
	if (!appToken) return fail('Missing appToken', 400);
	const sample = Math.min(
		MAX_SAMPLE,
		Math.max(0, Number.parseInt(event.url.searchParams.get('sample') ?? '3', 10) || 0)
	);

	const env = event.platform.env;

	try {
		const tables = await bitableListTables(env, { appToken });
		const out = [];
		for (const table of tables) {
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
		return ok({ appToken, tableCount: tables.length, tables: out });
	} catch (err) {
		return fail(err instanceof Error ? err.message : 'Bitable introspection failed', 502);
	}
};
