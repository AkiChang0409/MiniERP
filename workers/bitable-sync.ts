/**
 * Bitable → D1 mirror sync worker (B3b — scheduled pull).
 *
 * Runs the SAME pull engine as the manual `/api/admin/bitable/sync?all=true`
 * route, but on a Cron trigger so the D1 mirror stays fresh with edits made
 * directly in the Lark Base (the source of truth). Without this, `bitable_records`
 * only updates when MiniERP itself writes through — external Lark edits would
 * never flow back. The domains' raw read tools (P3) read this mirror, so keeping
 * it current is what makes them "live".
 *
 * Why a separate worker (not the SvelteKit fetch worker):
 *  - Cron `scheduled` handlers are owned per-worker; the SvelteKit CF adapter
 *    owns the app worker's entry, so background triggers live under `workers/`
 *    (same pattern as `document-processor.ts`).
 *  - Sync fans out Lark subrequests across ~20 tables; isolating it keeps that
 *    cost off the HTTP latency budget.
 *
 * Deploy: `wrangler deploy -c workers/wrangler.bitable-sync.jsonc`.
 * Prerequisite secrets on THIS worker (tenant token needs them):
 *   wrangler secret put LARK_APP_ID     -c workers/wrangler.bitable-sync.jsonc
 *   wrangler secret put LARK_APP_SECRET -c workers/wrangler.bitable-sync.jsonc
 */
import { getDb } from '../src/infrastructure/db';
import { syncBitableTables } from '../src/platform/integrations/lark/bitable-sync';
import { BITABLE_TABLES, bitableAppToken } from '../src/app/bitable/registry';

export default {
	async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
		let appToken: string;
		try {
			appToken = bitableAppToken(env);
		} catch (err) {
			console.error('[bitable-sync] LARK_BITABLE_APP_TOKEN not configured', err);
			return;
		}

		const db = getDb(env);
		const ready = BITABLE_TABLES.filter((t) => t.ready).map((t) => ({
			tableId: t.tableId,
			name: t.name
		}));

		try {
			const results = await syncBitableTables(env, db, appToken, ready);
			const pulled = results.reduce((n, r) => n + r.pulled, 0);
			const softDeleted = results.reduce((n, r) => n + r.softDeleted, 0);
			console.log(
				`[bitable-sync] ${results.length} tables synced — pulled=${pulled} softDeleted=${softDeleted}`
			);
		} catch (err) {
			// Never throw from a Cron run — log and let the next tick retry.
			console.error('[bitable-sync] sync failed', err);
		}
	}
};
