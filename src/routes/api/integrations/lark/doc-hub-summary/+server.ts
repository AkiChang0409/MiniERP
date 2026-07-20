/**
 * Doc Hub auto-summary webhook.
 *
 * The Lark automation ("Doc Hub 新增记录时" → 发送 HTTP 请求) posts here with the
 * new record's id. MiniERP then downloads the attachment, extracts + summarizes
 * the text, and writes the summary back into the record — see
 * `summarizeDocHubRecord`. The record's own "Processing Status" (Completed /
 * Failed) is the source of truth for the outcome, so we ACK the HTTP request
 * immediately and run the (slow: download + OCR + LLM) pipeline in the
 * background via `waitUntil`.
 *
 * Auth: optional shared bearer secret (`LARK_DOCHUB_WEBHOOK_SECRET`). Configure
 * the automation's HTTP node to send `Authorization: Bearer <secret>`.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { fail } from '$platform/http';
import { summarizeDocHubRecord } from '$platform/integrations/lark/doc-hub-summary';

/** Pull a record_id out of the many shapes a Lark automation HTTP node can send. */
function extractRecordId(body: unknown, url: URL): string | undefined {
	const fromQuery = url.searchParams.get('record_id') || url.searchParams.get('recordId');
	if (fromQuery?.trim()) return fromQuery.trim();

	const seen = new Set<unknown>();
	const walk = (node: unknown, depth: number): string | undefined => {
		if (!node || typeof node !== 'object' || depth > 6 || seen.has(node)) return undefined;
		seen.add(node);
		const obj = node as Record<string, unknown>;
		for (const key of ['record_id', 'recordId']) {
			const v = obj[key];
			if (typeof v === 'string' && v.trim()) return v.trim();
		}
		// A record object usually carries `record_id`; some payloads nest the id under `id`
		// on an object that also has `fields` (i.e. it's the record, not some other entity).
		if (typeof obj.id === 'string' && obj.id.trim() && 'fields' in obj) return obj.id.trim();
		for (const value of Object.values(obj)) {
			const hit = walk(value, depth + 1);
			if (hit) return hit;
		}
		return undefined;
	};
	return walk(body, 0);
}

function isAuthorized(env: Env, request: Request): boolean {
	const secret = env.LARK_DOCHUB_WEBHOOK_SECRET;
	if (!secret) return true; // unset → open (set it before exposing publicly)
	return request.headers.get('authorization') === `Bearer ${secret}`;
}

export const POST: RequestHandler = async (event) => {
	const { request, platform } = event;
	const env = platform?.env;
	if (!env) return fail('Cloudflare platform bindings are required', 500);

	if (!isAuthorized(env, request)) return fail('Unauthorized', 401);

	let body: unknown;
	try {
		const raw = await request.text();
		body = raw ? JSON.parse(raw) : {};
	} catch {
		return fail('Invalid JSON body', 400);
	}

	const recordId = extractRecordId(body, new URL(request.url));
	if (!recordId) {
		return fail('Could not find a record_id in the request body or query', 400);
	}

	// `sync=1` runs the pipeline inline and returns the summary — handy for
	// manual testing / curl. Default is fire-and-forget (Lark just needs the ACK;
	// the record's Processing Status carries the real outcome).
	const runSync = new URL(request.url).searchParams.get('sync') === '1';
	if (runSync) {
		const result = await summarizeDocHubRecord(env, recordId);
		return json({ ok: result.ok, data: result }, { status: result.ok ? 200 : 422 });
	}

	const work = summarizeDocHubRecord(env, recordId)
		.then((r) => console.log(`[doc-hub-summary] ${recordId}: ${r.ok ? 'ok' : `failed — ${r.reason}`}`))
		.catch((err) => console.error(`[doc-hub-summary] ${recordId} handler error:`, err));

	const ctx = platform?.ctx;
	if (ctx?.waitUntil) ctx.waitUntil(work);
	else await work;

	return json({ ok: true, data: { accepted: true, recordId } });
};
