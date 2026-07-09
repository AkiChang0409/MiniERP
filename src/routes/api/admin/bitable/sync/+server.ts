import type { RequestHandler } from './$types';

import { fail, ok } from '$platform/http';
import { createModuleContext } from '$platform/modules';
import { syncBitableTable, syncBitableTables } from '$platform/integrations/lark/bitable-sync';
import { BITABLE_TABLES, bitableAppToken, findBitableTable } from '$app-layer/bitable/registry';

/**
 * Owner/admin-only manual Bitable → D1 pull sync (Bitable-as-source-of-truth).
 * The scheduled Cron worker will call the same engine; this endpoint is for
 * on-demand runs + verification.
 *
 * POST/GET /api/admin/bitable/sync?table=<id|key>   — sync one table
 * POST/GET /api/admin/bitable/sync?all=true         — sync all "ready" tables
 *
 * GET is allowed too (owner-gated admin tool) so it can be run by pasting the URL
 * in a logged-in browser.
 */
const handler: RequestHandler = async (event) => {
	if (!event.platform) return fail('Cloudflare platform bindings are required', 500);
	const user = event.locals.user;
	if (!user) return fail('Unauthorized', 401);
	if (!user.roles.some((r) => r === 'owner' || r === 'admin')) {
		return fail('Forbidden — owner/admin only', 403);
	}

	const env = event.platform.env;
	const { db } = await createModuleContext(event);
	let appToken: string;
	try {
		appToken = bitableAppToken(env);
	} catch (err) {
		return fail(err instanceof Error ? err.message : 'app token not configured', 500);
	}

	const q = event.url.searchParams;
	const tableParam = q.get('table')?.trim();
	const all = q.get('all') === 'true';

	try {
		if (tableParam) {
			const def = findBitableTable(tableParam);
			if (!def) return fail(`Unknown table: ${tableParam}`, 400);
			const res = await syncBitableTable(env, db, {
				appToken,
				tableId: def.tableId,
				tableName: def.name
			});
			return ok({ synced: [res] });
		}
		if (all) {
			const ready = BITABLE_TABLES.filter((t) => t.ready).map((t) => ({
				tableId: t.tableId,
				name: t.name
			}));
			const res = await syncBitableTables(env, db, appToken, ready);
			return ok({ synced: res, tables: ready.length });
		}
		return fail('Pass ?table=<id|key> or ?all=true', 400);
	} catch (err) {
		return fail(err instanceof Error ? err.message : 'Bitable sync failed', 502);
	}
};

export const GET = handler;
export const POST = handler;
