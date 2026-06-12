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

function larkBaseUrl(env: Env): string {
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
 * Mint a tenant_access_token from LARK_APP_ID / LARK_APP_SECRET.
 * Docs: /open-apis/auth/v3/tenant_access_token/internal
 */
export async function getTenantAccessToken(env: Env): Promise<string> {
	const appId = env.LARK_APP_ID;
	const appSecret = env.LARK_APP_SECRET;
	if (!appId || !appSecret) {
		throw new Error('LARK_APP_ID / LARK_APP_SECRET are not configured');
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
	return data.tenant_access_token;
}

interface SendMessageResponse {
	code: number;
	msg?: string;
	data?: { message_id?: string };
}

/**
 * Send a plain-text message to a chat.
 * Docs: POST /open-apis/im/v1/messages?receive_id_type=chat_id
 * Requires the `im:message:send_as_bot` scope (see README / setup notes).
 */
export async function sendTextMessage(
	env: Env,
	chatId: string,
	text: string
): Promise<{ messageId?: string }> {
	const token = await getTenantAccessToken(env);
	const res = await fetch(`${larkBaseUrl(env)}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify({
			receive_id: chatId,
			msg_type: 'text',
			// Lark message content is itself a JSON string.
			content: JSON.stringify({ text })
		})
	});
	const data = (await res.json()) as SendMessageResponse;
	if (data.code !== 0) {
		throw new Error(`Lark send message failed: code=${data.code} msg=${data.msg ?? 'unknown'}`);
	}
	return { messageId: data.data?.message_id };
}
