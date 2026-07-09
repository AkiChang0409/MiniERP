/**
 * Minimal Lark (Feishu) OpenAPI client — Phase 3A (text reply only).
 *
 * No SDK / no new dependencies (uses global `fetch`). No persistence: the
 * tenant_access_token is fetched per send for now (caching is a later step).
 *
 * Base URL defaults to Feishu (`open.feishu.cn`). For international Lark, set
 * `LARK_BASE_URL=https://open.larksuite.com` in `.dev.vars`.
 */

const DEFAULT_BASE_URL = 'https://open.feishu.cn';

export function larkBaseUrl(env: Env): string {
	const configured = env.LARK_BASE_URL?.replace(/\/+$/, '');
	return configured && configured.length > 0 ? configured : DEFAULT_BASE_URL;
}

interface TenantTokenResponse {
	code: number;
	msg?: string;
	tenant_access_token?: string;
	expire?: number;
}

/**
 * Per-isolate cache of the tenant token. Lark tokens live ~2h; caching avoids a
 * token subrequest on every API call — critical because a single Worker
 * invocation has a subrequest cap (50 free / 1000 paid), and flows like Bitable
 * introspection or sync make many calls. Keyed by app id so a rare app switch
 * doesn't serve a stale token.
 */
let tenantTokenCache: { appId: string; value: string; expiresAt: number } | null = null;

/**
 * Mint (or reuse) a tenant_access_token from LARK_APP_ID / LARK_APP_SECRET.
 * Docs: /open-apis/auth/v3/tenant_access_token/internal
 */
export async function getTenantAccessToken(env: Env): Promise<string> {
	const appId = env.LARK_APP_ID;
	const appSecret = env.LARK_APP_SECRET;
	if (!appId || !appSecret) {
		throw new Error('LARK_APP_ID / LARK_APP_SECRET are not configured');
	}

	const now = Date.now();
	if (tenantTokenCache && tenantTokenCache.appId === appId && tenantTokenCache.expiresAt > now) {
		return tenantTokenCache.value;
	}

	const res = await fetch(`${larkBaseUrl(env)}/open-apis/auth/v3/tenant_access_token/internal`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
		body: JSON.stringify({ app_id: appId, app_secret: appSecret })
	});
	const data = (await res.json()) as TenantTokenResponse;
	if (data.code !== 0 || !data.tenant_access_token) {
		throw new Error(`Lark tenant_access_token failed: code=${data.code} msg=${data.msg ?? 'unknown'}`);
	}
	// Refresh 60s early; default 2h if `expire` is missing.
	const ttlSec = typeof data.expire === 'number' && data.expire > 0 ? data.expire : 7200;
	tenantTokenCache = {
		appId,
		value: data.tenant_access_token,
		expiresAt: now + Math.max(60, ttlSec - 60) * 1000
	};
	return data.tenant_access_token;
}

interface SendMessageResponse {
	code: number;
	msg?: string;
	data?: { message_id?: string };
}

export type LarkReceiveIdType = 'chat_id' | 'open_id' | 'user_id' | 'union_id' | 'email';

/**
 * Low-level send. Posts an already-encoded `content` string (Lark message
 * content is itself a JSON string) to a receiver of the given id type.
 * Docs: POST /open-apis/im/v1/messages?receive_id_type=<type>
 * Requires the `im:message:send_as_bot` scope (see README / setup notes).
 */
async function sendMessage(
	env: Env,
	args: { receiveId: string; receiveIdType: LarkReceiveIdType; msgType: string; content: string }
): Promise<{ messageId?: string }> {
	const token = await getTenantAccessToken(env);
	const url = `${larkBaseUrl(env)}/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(
		args.receiveIdType
	)}`;
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify({
			receive_id: args.receiveId,
			msg_type: args.msgType,
			content: args.content
		})
	});
	const data = (await res.json()) as SendMessageResponse;
	if (data.code !== 0) {
		throw new Error(`Lark send message failed: code=${data.code} msg=${data.msg ?? 'unknown'}`);
	}
	return { messageId: data.data?.message_id };
}

/** Send a plain-text message to a chat (chat_id). */
export async function sendTextMessage(
	env: Env,
	chatId: string,
	text: string
): Promise<{ messageId?: string }> {
	return sendMessage(env, {
		receiveId: chatId,
		receiveIdType: 'chat_id',
		msgType: 'text',
		content: JSON.stringify({ text })
	});
}

/**
 * Send an interactive card (msg_type `interactive`) to a receiver. Used to push
 * a document review card to a user's DM (`receive_id_type=open_id`). The `card`
 * object is the Lark card JSON (e.g. `{ config, header, elements }` or a
 * `{ type: 'template', data }` wrapper); it is JSON-stringified into `content`.
 */
export async function sendInteractiveCard(
	env: Env,
	receiveId: string,
	receiveIdType: LarkReceiveIdType,
	card: Record<string, unknown>
): Promise<{ messageId?: string }> {
	return sendMessage(env, {
		receiveId,
		receiveIdType,
		msgType: 'interactive',
		content: JSON.stringify(card)
	});
}

/**
 * Download a file/image resource a user sent in a message.
 * Docs: GET /open-apis/im/v1/messages/{message_id}/resources/{file_key}?type=image|file
 * Requires the `im:resource` scope. Success returns the raw binary; an error
 * returns a JSON envelope (`code != 0`), which we surface as a throw.
 */
export async function downloadMessageResource(
	env: Env,
	messageId: string,
	fileKey: string,
	type: 'image' | 'file'
): Promise<{ bytes: Uint8Array; mimeType: string }> {
	const token = await getTenantAccessToken(env);
	const url = `${larkBaseUrl(env)}/open-apis/im/v1/messages/${encodeURIComponent(
		messageId
	)}/resources/${encodeURIComponent(fileKey)}?type=${type}`;
	const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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
		throw new Error(`Lark resource download failed: ${detail}`);
	}
	const bytes = new Uint8Array(await res.arrayBuffer());
	return { bytes, mimeType: contentType || 'application/octet-stream' };
}
