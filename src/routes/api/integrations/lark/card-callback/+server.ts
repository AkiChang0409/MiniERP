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
import { bitableUpdateRecord } from '$platform/integrations/lark/bitable';
import { buildResultCard } from '$platform/integrations/lark/cards/intake-review-card';
import {
	createDocumentIntakeService,
	type DocumentProcessorMessage
} from '$modules/document-intake';
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
	/** QC intake: the Doc Hub (Bitable) record_id to confirm/reject. */
	record_id?: string;
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

/**
 * Lark files arrive raw (no browser preprocessing that the App's OCR.space route
 * relies on). Route photos through the vision LLM (reads the full document, no
 * resize/convert needed, handles low-res); keep tif/bmp on OCR.space (which now
 * gets the correct filetype hint).
 */
function ocrStrategyForLark(mimeType: string, fileName: string): 'vision_openai' | 'ocr_api' {
	const m = mimeType.toLowerCase();
	const n = fileName.toLowerCase();
	const visionFriendly = /image\/(png|jpe?g|webp|gif)/.test(m) || /\.(png|jpe?g|webp|gif)$/.test(n);
	return visionFriendly ? 'vision_openai' : 'ocr_api';
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

	// --- QC intake (Doc Hub in Lark Bitable): confirm/reject by record_id ---
	// Runs before the finance documentId guard + MiniERP-user resolution: QC
	// writes to Bitable as the app, so no D1 user attribution is needed.
	if (kind === 'qc_confirm' || kind === 'qc_reject') {
		const recordId = action?.record_id;
		if (!recordId) return toast('info', '无法识别记录。');
		const appToken = env.LARK_DOCHUB_APP_TOKEN;
		const tableId = env.LARK_DOCHUB_TABLE_ID;
		if (!appToken || !tableId) return toast('error', 'Doc Hub 未配置。');

		// Category / File Type are relation fields classified in the record itself
		// (native cascade); the card only drives status.
		const newStatus = kind === 'qc_confirm' ? 'Effective' : 'Rejected';
		const work = bitableUpdateRecord(env, {
			appToken,
			tableId,
			recordId,
			fields: { 'Doc Status': newStatus }
		})
			.then(() => {
				if (!openId) return;
				return sendInteractiveCard(
					env,
					openId,
					'open_id',
					buildResultCard(
						kind === 'qc_confirm' ? '✅ Confirmed' : '🚫 Rejected',
						kind === 'qc_confirm'
							? 'QC file marked Effective in Doc Hub.'
							: 'QC file marked Rejected.',
						kind === 'qc_confirm' ? 'green' : 'red'
					)
				);
			})
			.catch((e) => console.error('[lark] qc action failed:', e));
		const qcExec = event.platform?.ctx;
		if (qcExec?.waitUntil) qcExec.waitUntil(work);
		else void work;
		return toast('info', kind === 'qc_confirm' ? '正在确认…' : '正在驳回…');
	}

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

	// --- Conversational flow: project picked → process, then push editable card ---
	if (kind === 'pick_project') {
		const projectId = readSelectedOption(body);
		if (!projectId) return toast('error', '未获取到所选项目，请重新选择。');

		// Remember the picked project so the ready_for_review notifier can embed it
		// in the editable review card it pushes once processing completes.
		await env.KV.put(`lark:fin-project:${documentId}`, projectId, { expirationTtl: 3600 });

		// Choose the OCR route by the stored file's type (raw Lark file → no browser
		// preprocessing, so vision for photos / OCR.space for tif/bmp).
		const intake = createDocumentIntakeService({ db: ctx.db, env: ctx.env, user: resolved });
		const artifact = await intake.getDocumentArtifact({ tenantId: 'default', documentId });
		const ocrStrategy = ocrStrategyForLark(
			artifact?.originalFile.mimeType ?? '',
			artifact?.originalFile.fileName ?? ''
		);

		// The pipeline (OCR + 2 LLM calls) must NOT run in this HTTP worker's
		// waitUntil — it gets evicted mid-run and strands the artifact in
		// 'processing'. Route it through the same async queue the App upload uses;
		// the queue worker completes it and the notifier pushes the editable card.
		if (env.DOCUMENT_QUEUE) {
			await env.DOCUMENT_QUEUE.send({
				v: 1,
				documentId,
				tenantId: 'default',
				userId: resolved.id,
				userEmail: resolved.email,
				ocrStrategy
			} satisfies DocumentProcessorMessage);
		} else {
			// Dev / no queue binding: process inline (localhost budget is generous).
			// The notifier still sends the card at ready_for_review.
			const work = processIntakeDocument(ctx, documentId, { ocrStrategy }).catch((err) =>
				console.error('[lark] inline pick_project processing failed:', err)
			);
			const exec = event.platform?.ctx;
			if (exec?.waitUntil) exec.waitUntil(work);
			else await work;
		}
		return toast('info', '已收到，正在识别单据，稍后会推送可编辑的字段卡片…');
	}

	// Writes (confirm/approve/reject) run several sequential D1 ops (create record
	// + audit hash-chain + markConfirmed) that can exceed Lark's ~3s callback
	// window → Lark shows "出错了 code 200341" even though the write succeeded.
	// Fix: ACK immediately with a "处理中" toast, do the write in the background,
	// and push the real result as a follow-up card.
	const pushResult = (card: Record<string, unknown>) =>
		sendInteractiveCard(env, openId, 'open_id', card).catch((e) =>
			console.error('[lark] result card send failed:', e)
		);
	const runBackground = (work: Promise<unknown>) => {
		const guarded = work.catch((e) => console.error('[lark] bg work failed:', e));
		const exec = event.platform?.ctx;
		if (exec?.waitUntil) exec.waitUntil(guarded);
		else void guarded;
	};

	// --- Conversational flow: editable card submitted → persist edited fields ---
	if (kind === 'approve') {
		const categoryId = action.category_id;
		const category = categoryId ? findCategoryById(categoryId) : undefined;
		if (!category) return toast('error', '类别缺失，请重试或在 App 中处理。');
		const projectId = action.project_id && action.project_id.trim() ? action.project_id : null;
		const fields = readFormValue(body);

		runBackground(
			confirmInbox(ctx, {
				documentId,
				categoryId: category.id,
				fields,
				projectId,
				actor: { id: resolved.id, email: resolved.email }
			}).then((result) =>
				pushResult(
					result.ok
						? buildResultCard('✅ 已入库', `已记账：${category.label}。`, 'green')
						: buildResultCard(
								'入库未完成',
								result.status === 409 ? '该文档已处理。' : `失败：${result.error}`,
								'red'
							)
				)
			)
		);
		return toast('info', '正在入库，请稍候…');
	}

	if (kind === 'reject') {
		const intake = createDocumentIntakeService({ db: ctx.db, env: ctx.env, user: resolved });
		runBackground(
			intake
				.abandonIntake({ tenantId: 'default', documentId, reason: 'Rejected via Lark card' })
				.then((result) =>
					pushResult(
						result.ok
							? buildResultCard('🚫 已放弃', '已放弃，不会创建任何记录。', 'grey')
							: buildResultCard(
									'未完成',
									result.status === 'not_abandonable' ? '该文档已处理。' : '未找到该文档。',
									'red'
								)
					)
				)
		);
		return toast('info', '正在处理…');
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

		const intake = createDocumentIntakeService({ db: ctx.db, env: ctx.env, user: resolved });
		runBackground(
			(async () => {
				// Server-authoritative: rebuild the fields from the stored artifact.
				const artifact = await intake.getDocumentArtifact({ tenantId: 'default', documentId });
				if (!artifact) return pushResult(buildResultCard('未完成', '未找到该文档。', 'red'));
				const result = await confirmInbox(ctx, {
					documentId,
					categoryId: category.id,
					fields: (artifact.suggestedFields?.fields ?? {}) as Record<string, unknown>,
					projectId: null,
					actor: { id: resolved.id, email: resolved.email }
				});
				return pushResult(
					result.ok
						? buildResultCard('✅ 已入库', `已记账：${category.label}。`, 'green')
						: buildResultCard(
								'入库未完成',
								result.status === 409 ? '该文档已处理。' : `失败：${result.error}`,
								'red'
							)
				);
			})()
		);
		return toast('info', '正在入库，请稍候…');
	}

	return toast('info', '暂不支持的卡片操作。');
};
