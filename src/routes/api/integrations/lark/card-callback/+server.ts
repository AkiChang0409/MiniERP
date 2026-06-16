import { json, type RequestHandler } from '@sveltejs/kit';
import { fail } from '$platform/http';
import {
	asString,
	handleUrlVerification,
	rejectEncryptedCallback,
	resolveVerificationToken,
	verifyCallbackToken
} from '$platform/integrations/lark/verify';
import { resolveUserByExternalIdentity } from '$platform/auth/resolve-external-identity';
import { createWorkerContext } from '$platform/context';
import { createDocumentIntakeService } from '$modules/document-intake';
import { findCategoryById } from '$modules/finance';
import { confirmInbox } from '$app-layer/finance-intake/confirm-inbox';

/**
 * Lark (Feishu) interactive-card callback — the "回调配置" endpoint.
 *
 * Fires when a user taps Confirm / Reject on the document review card pushed by
 * `notifyLarkReviewCard` at `ready_for_review`. Confirm persists the artifact
 * (via the shared `confirmInbox` orchestrator); Reject abandons the intake.
 *
 * Shares verification (token + url_verification + encrypted-mode policy) with
 * the event webhook via `$platform/integrations/lark/verify`. Card action
 * dispatch is server-authoritative: the button only carries
 * `{ action, document_id, category_id }`; field values are rebuilt from the
 * stored artifact, and the acting user is resolved from the Lark open_id (never
 * trusted from the payload).
 *
 * Must ACK within 3s. Confirm/Reject are pure D1 writes (no AI), so they run
 * inline and the response carries a result toast.
 */

const LARK_PROVIDER = 'lark';
/** Short window to drop a double-tap before the first write commits. */
const ACTION_DEDUP_TTL = 60;

interface CardAction {
	action?: string;
	document_id?: string;
	category_id?: string;
}

/** Lark `{ toast: { type, content } }` response (card 2.0 callback). */
function toast(type: 'success' | 'info' | 'error', content: string) {
	return json({ toast: { type, content } });
}

/** Extract the action value across card 2.0 (`event.action`) + legacy shapes. */
function readAction(body: Record<string, unknown>): CardAction | null {
	const event = body.event as Record<string, unknown> | undefined;
	const action = (event?.action ?? body.action) as Record<string, unknown> | undefined;
	const value = action?.value;
	if (value && typeof value === 'object') return value as CardAction;
	return null;
}

/** Operator open_id across card 2.0 (`event.operator.open_id`) + legacy (`open_id`). */
function readOpenId(body: Record<string, unknown>): string | undefined {
	const event = body.event as Record<string, unknown> | undefined;
	const operator = event?.operator as Record<string, unknown> | undefined;
	return asString(operator?.open_id) ?? asString(body.open_id);
}

/**
 * Liveness probe. Lark posts callbacks, but a GET (browser check / health ping)
 * must still return JSON — a bare 405 has no body and trips Lark's "返回数据不是
 * 合法的 JSON 格式" check during URL setup.
 */
export const GET: RequestHandler = async () => json({ ok: true, endpoint: 'lark-card-callback' });

export const POST: RequestHandler = async (event) => {
	const tokenResult = resolveVerificationToken(event.platform?.env);
	if ('response' in tokenResult) return tokenResult.response;
	const expectedToken = tokenResult.token;
	const env = event.platform!.env;

	const rawBody = await event.request.text();
	// Log the raw inbound request so the exact Lark verification/callback shape
	// is visible in `wrangler tail` / Cloudflare logs when diagnosing setup.
	console.log(`[lark] card-callback POST body=${rawBody.slice(0, 400)}`);
	let body: Record<string, unknown>;
	try {
		body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
	} catch {
		return fail('Invalid JSON body', 400);
	}

	const encrypted = rejectEncryptedCallback(body);
	if (encrypted) return encrypted;

	// Lark verifies this callback URL with its own url_verification handshake.
	const handshake = handleUrlVerification(body, expectedToken);
	if (handshake) return handshake;

	// Real card callback — verify the token before trusting any field.
	if (!verifyCallbackToken(body, expectedToken)) {
		return fail('Invalid verification token', 401);
	}

	const action = readAction(body);
	const openId = readOpenId(body);
	const documentId = action?.document_id;
	const kind = action?.action;
	console.log(`[lark] card action=${kind ?? 'n/a'} doc=${documentId ?? 'n/a'} by=${openId ?? '(unknown)'}`);

	if (!action || !kind || !documentId) {
		return toast('info', '无法识别的卡片操作。');
	}
	if (!openId) {
		return toast('error', '无法识别操作者身份。');
	}

	// Resolve the acting MiniERP user from the Lark open_id (never the payload).
	// Build the worker context with that user so finance writes are attributed
	// correctly (createWorkerContext gives us the DBClient for the lookup too).
	let ctx = await createWorkerContext(env);
	const resolved = await resolveUserByExternalIdentity(ctx.db, LARK_PROVIDER, openId);
	if (!resolved) {
		return toast('error', '你的 Lark 账号尚未绑定 MiniERP 账号。');
	}
	ctx = await createWorkerContext(env, resolved);

	// Drop a rapid double-tap before the first write commits. The artifact
	// state guard in confirmInbox/abandonIntake is the durable idempotency check.
	const dedupKey = `lark:card-action:${documentId}:${kind}`;
	if (await env.KV.get(dedupKey)) {
		return toast('info', '操作正在处理或已完成。');
	}
	await env.KV.put(dedupKey, '1', { expirationTtl: ACTION_DEDUP_TTL });

	if (kind === 'reject') {
		const intake = createDocumentIntakeService({ db: ctx.db, env: ctx.env, user: resolved });
		const result = await intake.abandonIntake({
			tenantId: 'default',
			documentId,
			reason: 'Rejected via Lark card'
		});
		if (!result.ok) {
			if (result.status === 'not_abandonable') return toast('info', '该文档已处理，无需放弃。');
			return toast('error', '未找到该文档。');
		}
		return toast('success', '已放弃，不会创建任何记录。');
	}

	if (kind === 'confirm') {
		const categoryId = action.category_id;
		const category = categoryId ? findCategoryById(categoryId) : undefined;
		if (!category) {
			return toast('info', '未确定文档类别，请在 App 中选择后确认。');
		}
		const needsProjectInApp =
			category.requiresProject ||
			(category.persistTarget !== 'expenses' && category.persistTarget !== 'revenue');
		if (needsProjectInApp) {
			return toast('info', '此类别需要在 App 中选择项目后确认。');
		}

		// Server-authoritative: rebuild the fields from the stored artifact.
		const intake = createDocumentIntakeService({ db: ctx.db, env: ctx.env, user: resolved });
		const artifact = await intake.getDocumentArtifact({ tenantId: 'default', documentId });
		if (!artifact) return toast('error', '未找到该文档。');

		const result = await confirmInbox(ctx, {
			documentId,
			categoryId: category.id,
			fields: (artifact.suggestedFields?.fields ?? {}) as Record<string, unknown>,
			projectId: null,
			actor: { id: resolved.id, email: resolved.email }
		});

		if (!result.ok) {
			if (result.status === 409) return toast('info', '该文档已处理。');
			return toast('error', `确认失败：${result.error}`);
		}
		return toast('success', '已确认并记账。');
	}

	return toast('info', '暂不支持的卡片操作。');
};
