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
import { sendInteractiveCard } from '$platform/integrations/lark/client';
import {
	buildEditableReviewCard,
	buildNoticeCard
} from '$platform/integrations/lark/cards/finance-intake-cards';
import { createDocumentIntakeService } from '$modules/document-intake';
import { findCategoryById } from '$modules/finance';
import { confirmInbox } from '$app-layer/finance-intake/confirm-inbox';
import { processIntakeDocument } from '$app-layer/finance-intake/process-intake';

/**
 * Lark (Feishu) interactive-card callback — the "回调配置" endpoint.
 *
 * Handles every card action by `action` value:
 *  - `pick_project` — conversational flow: user picked a project on the picker
 *    card. ACK fast, then (in waitUntil) run OCR/classify/extract and push the
 *    editable review card. OCR+LLM exceed Lark's 3s window, so it must be async.
 *  - `approve` — conversational flow: editable review card submitted. Persist
 *    the user-edited `form_value` fields via `confirmInbox` (pure D1, inline).
 *  - `confirm` — read-only review card (App-upload flow) Confirm: persist the
 *    AI-suggested fields as-is.
 *  - `reject` — abandon the intake.
 *
 * Shares verification (token + url_verification + encrypted-mode policy) with
 * the event webhook via `$platform/integrations/lark/verify`. The acting user is
 * resolved from the Lark open_id (never trusted from the payload); routing data
 * rides on the card `value`, edited field values on `form_value`.
 */

const LARK_PROVIDER = 'lark';
/** Short window to drop a double-tap before the first write commits. */
const ACTION_DEDUP_TTL = 60;

interface CardAction {
	action?: string;
	document_id?: string;
	category_id?: string;
	project_id?: string;
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

/** Selected option of a select_static (project picker) — `event.action.option`. */
function readSelectedOption(body: Record<string, unknown>): string | undefined {
	const event = body.event as Record<string, unknown> | undefined;
	const action = (event?.action ?? body.action) as Record<string, unknown> | undefined;
	const option = action?.option;
	if (typeof option === 'object' && option) {
		return asString((option as Record<string, unknown>).value);
	}
	return asString(option) ?? asString(action?.selected_option);
}

/** Submitted form values of a form_submit (editable review) — `event.action.form_value`. */
function readFormValue(body: Record<string, unknown>): Record<string, unknown> {
	const event = body.event as Record<string, unknown> | undefined;
	const action = (event?.action ?? body.action) as Record<string, unknown> | undefined;
	const fv = action?.form_value;
	return fv && typeof fv === 'object' ? (fv as Record<string, unknown>) : {};
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

	// --- Conversational flow: project picked → run OCR/extract, push editable card ---
	if (kind === 'pick_project') {
		const projectId = readSelectedOption(body);
		if (!projectId) return toast('error', '未获取到所选项目，请重新选择。');

		// OCR + 2 LLM calls far exceed Lark's 3s ACK window → ACK now, process in
		// the background, then push the editable review card to the user's DM.
		const work = (async () => {
			try {
				const artifact = await processIntakeDocument(ctx, documentId);
				if (!artifact.suggestedCategoryId) {
					await sendInteractiveCard(
						env,
						openId,
						'open_id',
						buildNoticeCard('无法自动分类', '未能识别文档类别，请在 App 中处理。', 'red')
					);
					return;
				}
				const card = buildEditableReviewCard({
					documentId,
					categoryId: artifact.suggestedCategoryId,
					fileName: artifact.originalFile.fileName,
					documentType: artifact.documentType,
					fields: (artifact.suggestedFields?.fields ?? {}) as Record<string, unknown>,
					confidence: artifact.suggestedFields?.confidence,
					projectId
				});
				await sendInteractiveCard(env, openId, 'open_id', card);
			} catch (err) {
				console.error('[lark] pick_project processing failed:', err);
				await sendInteractiveCard(
					env,
					openId,
					'open_id',
					buildNoticeCard('识别失败', '处理文档时出错，请重试或在 App 中处理。', 'red')
				).catch(() => {});
			}
		})();
		const exec = event.platform?.ctx;
		if (exec?.waitUntil) exec.waitUntil(work);
		else await work;
		return toast('info', '正在识别单据，请稍候…');
	}

	// --- Conversational flow: editable card submitted → persist edited fields ---
	if (kind === 'approve') {
		const categoryId = action.category_id;
		const category = categoryId ? findCategoryById(categoryId) : undefined;
		if (!category) return toast('error', '类别缺失，请重试或在 App 中处理。');
		const projectId = action.project_id && action.project_id.trim() ? action.project_id : null;
		const fields = readFormValue(body);

		const result = await confirmInbox(ctx, {
			documentId,
			categoryId: category.id,
			fields,
			projectId,
			actor: { id: resolved.id, email: resolved.email }
		});
		if (!result.ok) {
			if (result.status === 409) return toast('info', '该文档已处理。');
			return toast('error', `确认失败：${result.error}`);
		}
		return toast('success', '已确认并记账 ✅');
	}

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
