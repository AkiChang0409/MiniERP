import { json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { fail } from '$platform/http';
import { createModuleContext } from '$platform/modules';
import type { ModuleContext } from '$platform/modules/types';
import { resolveUserByExternalIdentity } from '$platform/auth/resolve-external-identity';
import type { OrchestratorResult } from '$platform/ai/orchestrator';
import {
	sendTextMessage,
	sendInteractiveCard,
	downloadMessageResource
} from '$platform/integrations/lark/client';
import {
	asString,
	handleUrlVerification,
	rejectEncryptedCallback,
	resolveVerificationToken,
	verifyCallbackToken
} from '$platform/integrations/lark/verify';
import {
	buildUploadPromptCard,
	buildProjectPickerCard,
	buildNoticeCard,
	type ProjectOption
} from '$platform/integrations/lark/cards/finance-intake-cards';
import { buildOrchestratorConfirmCard } from '$platform/integrations/lark/cards/orchestrator-confirm-card';
import { createDocumentIntakeService } from '$modules/document-intake';
import { createProjectApi } from '$modules/project';
import { runSmartFinOrchestrator } from '$app-layer/ai/orchestrator/create-smartfin-orchestrator';

/** Lark bot menu event_key that starts the finance document-intake flow. */
const FINANCE_INTAKE_MENU_KEY = 'space_ocr_start';
const PROJECT_PICKER_QUERY_LIMIT = 200;
const CLOSED_PROJECT_STATUSES = new Set(['completed', 'archived', 'terminated', 'cancelled', 'canceled']);

function isSelectableProjectStatus(status: unknown): boolean {
	const normalized = asString(status)?.trim().toLowerCase();
	return !normalized || !CLOSED_PROJECT_STATUSES.has(normalized);
}

/**
 * Lark (Feishu) event webhook — HR leave assistant.
 *
 * Flow: text → resolve identity → tool-aware LLM intent (fallback rule-based) →
 * dispatcher (validate capability allow-list, backend leave-type resolver) →
 * read executes now / write goes through a text confirmation loop → result is
 * summarized by the LLM (fallback fixed template) → reply.
 *
 * The LLM only proposes structure; it never executes, never decides identity
 * (no personId/userId field), and never bypasses confirmation or tool-policy.
 * Execution always goes through executeGuardedCapability with the MiniERP user
 * resolved from the Lark open_id. Capabilities call the HR facade only.
 */

const LARK_PROVIDER = 'lark';
/** Inbound-event dedup window (seconds) — must cover Lark's retry schedule. */
const LARK_EVENT_DEDUP_TTL = 300;

/** Render a channel-agnostic orchestrator result into a Lark text reply. */
function renderResultForLark(result: OrchestratorResult): string {
	if (result.kind === 'clarification' && result.candidates?.length) {
		const opts = result.candidates.map((c, i) => `${i + 1}. ${c.label}`).join('\n');
		return `${result.message}\n${opts}`;
	}
	if (result.kind === 'confirmation') {
		return `${result.message}\n（回复「确认」执行，或「取消」放弃）`;
	}
	return result.message;
}

/**
 * Stable id for inbound-event dedup. Lark reuses `header.event_id` across the
 * retries of one delivery, so it's the primary key; `message.message_id` is the
 * fallback for legacy payloads.
 */
function eventDedupId(body: Record<string, unknown>): string | undefined {
	const header = body.header as Record<string, unknown> | undefined;
	const fromHeader = asString(header?.event_id);
	if (fromHeader) return fromHeader;
	const ev = body.event as Record<string, unknown> | undefined;
	const msg = ev?.message as Record<string, unknown> | undefined;
	return asString(msg?.message_id);
}

/** Handle one im.message.receive_v1 event. Sends all replies via the Lark API. */
async function handleLarkMessage(event: RequestEvent, body: Record<string, unknown>): Promise<void> {
	const env = event.platform?.env;
	if (!env) return;

	const messageEvent = body.event as Record<string, unknown> | undefined;
	const message = messageEvent?.message as Record<string, unknown> | undefined;
	const sender = messageEvent?.sender as Record<string, unknown> | undefined;
	const senderId = sender?.sender_id as Record<string, unknown> | undefined;

	const openId = asString(senderId?.open_id);
	const chatId = asString(message?.chat_id);
	const messageType = asString(message?.message_type);

	if (!chatId) {
		console.log('[lark] message event missing chat_id; skipped');
		return;
	}
	const send = (text: string) =>
		sendTextMessage(env, chatId, text).catch((e) => console.error('[lark] send failed:', e));

	if (!openId) {
		await send('无法识别发送者 open_id。');
		return;
	}
	if (messageType !== 'text') {
		console.log(`[lark] unsupported message type: ${messageType ?? 'unknown'}`);
		await send('MiniERP: 暂时只支持文本消息 (unsupported message type)。');
		return;
	}

	let userText = '';
	try {
		const parsed = JSON.parse(asString(message?.content) ?? '{}') as { text?: unknown };
		userText = asString(parsed.text) ?? '';
	} catch {
		userText = '';
	}

	// Resolve the acting MiniERP user from the Lark open_id (never trust the payload).
	const ctx = await createModuleContext(event);
	const resolved = await resolveUserByExternalIdentity(ctx.db, LARK_PROVIDER, openId);
	if (!resolved) {
		await send(`你的 Lark 账号尚未绑定 MiniERP 账号。open_id: ${openId}`);
		return;
	}
	const mc: ModuleContext = { ...ctx, user: resolved };

	// Route through the unified orchestrator — the SAME path as the AI Panel. It
	// resolves intent, runs read tools / stages writes for confirmation (HR leave,
	// project changes, …), and returns a channel-agnostic result we render back to
	// Lark text. Reply "确认" / "取消" to apply or drop a staged write.
	const result = await runSmartFinOrchestrator(
		{
			source: 'lark',
			userId: resolved.id,
			externalUserId: openId,
			roles: resolved.roles,
			conversationId: `lark:${openId}`,
			text: userText,
			channel: { type: 'direct' }
		},
		{ moduleContext: mc }
	);

	// A staged write → send an interactive card with Confirm/Cancel buttons that
	// post the actionId back (card-callback → orchestrator confirm), instead of
	// asking the user to type "确认".
	if (result.kind === 'confirmation' && result.actionId) {
		await sendInteractiveCard(
			env,
			chatId,
			'chat_id',
			buildOrchestratorConfirmCard(result.actionId, `lark:${openId}`, result.message)
		).catch((e) => console.error('[lark] send card failed:', e));
		return;
	}

	await send(renderResultForLark(result));
}

// ===========================================================================
// Finance document-intake flow (coexists with HR; never touches HR logic).
// Entry points: the "财务文件录入" bot menu (event_key space_ocr_start) and any
// image/file message. The flow is stateless — each card embeds the context
// (documentId / categoryId / projectId) the next step needs.
// ===========================================================================

/** Bot custom-menu click → resolve user → prompt for a document upload. */
async function handleMenuEvent(event: RequestEvent, body: Record<string, unknown>): Promise<void> {
	const env = event.platform?.env;
	if (!env) return;

	const eventObj = body.event as Record<string, unknown> | undefined;
	const eventKey = asString(eventObj?.event_key);
	if (eventKey !== FINANCE_INTAKE_MENU_KEY) {
		console.log(`[lark] unhandled menu event_key: ${eventKey ?? '(none)'}`);
		return;
	}
	const operator = eventObj?.operator as Record<string, unknown> | undefined;
	const operatorId = operator?.operator_id as Record<string, unknown> | undefined;
	const openId = asString(operatorId?.open_id);
	if (!openId) {
		console.log('[lark] menu event missing operator open_id');
		return;
	}

	// Menu events carry no chat_id — reply to the user's DM via open_id.
	const ctx = await createModuleContext(event);
	const resolved = await resolveUserByExternalIdentity(ctx.db, LARK_PROVIDER, openId);
	const card = resolved
		? buildUploadPromptCard()
		: buildNoticeCard('未绑定账号', `你的 Lark 账号尚未绑定 MiniERP 账号。open_id: ${openId}`, 'red');
	await sendInteractiveCard(env, openId, 'open_id', card).catch((e) =>
		console.error('[lark] send card failed:', e)
	);
}

/** Image/file message → download → store as artifact → project-picker card. */
async function handleFinanceFileMessage(
	event: RequestEvent,
	body: Record<string, unknown>
): Promise<void> {
	const env = event.platform?.env;
	if (!env) return;

	const messageEvent = body.event as Record<string, unknown> | undefined;
	const message = messageEvent?.message as Record<string, unknown> | undefined;
	const sender = messageEvent?.sender as Record<string, unknown> | undefined;
	const senderId = sender?.sender_id as Record<string, unknown> | undefined;

	const openId = asString(senderId?.open_id);
	const chatId = asString(message?.chat_id);
	const messageId = asString(message?.message_id);
	const messageType = asString(message?.message_type);
	if (!chatId || !openId || !messageId) {
		console.log('[lark] finance file message missing chat_id/open_id/message_id; skipped');
		return;
	}
	const sendText = (text: string) =>
		sendTextMessage(env, chatId, text).catch((e) => console.error('[lark] send failed:', e));

	const ctx = await createModuleContext(event);
	const resolved = await resolveUserByExternalIdentity(ctx.db, LARK_PROVIDER, openId);
	if (!resolved) {
		await sendText(`你的 Lark 账号尚未绑定 MiniERP 账号。open_id: ${openId}`);
		return;
	}
	const mc: ModuleContext = { ...ctx, user: resolved };

	// Resolve file_key + download type from the message content.
	let fileKey: string | undefined;
	let fileName: string;
	let resourceType: 'image' | 'file';
	try {
		const content = JSON.parse(asString(message?.content) ?? '{}') as {
			image_key?: string;
			file_key?: string;
			file_name?: string;
		};
		if (messageType === 'image') {
			resourceType = 'image';
			fileKey = content.image_key;
			fileName = `lark-image-${messageId}.jpg`;
		} else {
			resourceType = 'file';
			fileKey = content.file_key;
			fileName = content.file_name ?? `lark-file-${messageId}`;
		}
	} catch {
		await sendText('无法解析文件消息。');
		return;
	}
	if (!fileKey) {
		await sendText('未找到文件，请重新发送。');
		return;
	}

	let bytes: Uint8Array;
	let mimeType: string;
	try {
		const dl = await downloadMessageResource(env, messageId, fileKey, resourceType);
		bytes = dl.bytes;
		mimeType = dl.mimeType;
	} catch (err) {
		console.error('[lark] resource download failed:', err);
		await sendText('下载文件失败，请稍后重试。');
		return;
	}

	let documentId: string;
	try {
		const intake = createDocumentIntakeService({ db: ctx.db, env, user: resolved });
		const artifact = await intake.createDocumentFromUpload({
			tenantId: 'default',
			uploadedBy: resolved.id,
			uploadedFrom: 'lark',
			fileName,
			mimeType,
			body: bytes,
			sizeBytes: bytes.byteLength
		});
		documentId = artifact.id;
	} catch (err) {
		const msg = err instanceof Error ? err.message : '存储失败';
		await sendText(`文件存储失败：${msg}`);
		return;
	}

	// Offer the project picker. Project status vocabulary has drifted across
	// releases (`active`, `ongoing`, `under_review`, `unassigned`), so filter out
	// terminal states instead of requiring legacy `active`.
	let projects: ProjectOption[] = [];
	try {
		const rows = await createProjectApi(mc).list({ pageSize: PROJECT_PICKER_QUERY_LIMIT });
		projects = rows
			.filter((r) => isSelectableProjectStatus(r.project.status))
			.map((r) => ({
				id: r.project.id,
				name: r.project.name,
				customerName: r.customerName
			}));
		console.log(`[lark] project picker rows=${rows.length} selectable=${projects.length}`);
	} catch (err) {
		console.error('[lark] project list failed:', err);
	}

	await sendInteractiveCard(
		env,
		chatId,
		'chat_id',
		buildProjectPickerCard(documentId, projects)
	).catch((e) => console.error('[lark] send card failed:', e));
}

/** Route an inbound message: image/file → finance intake; else → HR assistant. */
async function handleInboundMessage(
	event: RequestEvent,
	body: Record<string, unknown>
): Promise<void> {
	const messageEvent = body.event as Record<string, unknown> | undefined;
	const message = messageEvent?.message as Record<string, unknown> | undefined;
	const messageType = asString(message?.message_type);
	if (messageType === 'image' || messageType === 'file') {
		await handleFinanceFileMessage(event, body);
		return;
	}
	await handleLarkMessage(event, body);
}

export const POST: RequestHandler = async (event) => {
	const tokenResult = resolveVerificationToken(event.platform?.env);
	if ('response' in tokenResult) return tokenResult.response;
	const expectedToken = tokenResult.token;

	const rawBody = await event.request.text();
	let body: Record<string, unknown>;
	try {
		body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
	} catch {
		return fail('Invalid JSON body', 400);
	}

	// --- Encrypted mode (LARK_ENCRYPT_KEY) — not supported yet ---
	const encrypted = rejectEncryptedCallback(body);
	if (encrypted) return encrypted;

	// --- 1) URL verification handshake ---
	const handshake = handleUrlVerification(body, expectedToken);
	if (handshake) return handshake;

	// --- 2) Event callback — verify token, then handle ---
	// schema 2.0 → header.token; legacy v1 → top-level token.
	if (!verifyCallbackToken(body, expectedToken)) {
		return fail('Invalid verification token', 401);
	}

	const header = body.header as Record<string, unknown> | undefined;
	const eventType = asString(header?.event_type) ?? 'unknown';

	const isMessage = eventType === 'im.message.receive_v1';
	const isMenu = eventType === 'application.bot.menu_v6';

	if ((isMessage || isMenu) && event.platform?.env) {
		const kvEnv = event.platform.env;

		// Inbound dedup: Lark re-delivers the same event on retry (same event_id).
		// Mark-as-seen SYNCHRONOUSLY before scheduling work so a sequential retry —
		// even one that arrives while the first is still processing — is skipped.
		// One event_id ⇒ one business run ⇒ one reply.
		const dedupId = eventDedupId(body);
		if (dedupId) {
			const seenKey = `lark:seen:${dedupId}`;
			if (await kvEnv.KV.get(seenKey)) {
				console.log(`[lark] duplicate event ${dedupId} — already processed, skipping`);
				return json({ ok: true });
			}
			await kvEnv.KV.put(seenKey, '1', { expirationTtl: LARK_EVENT_DEDUP_TTL });
		}

		console.log(`[lark] handling ${eventType} ${dedupId ?? '(no id)'}`);
		// ACK fast; do the work (identity resolve, download, classify, reply) after
		// responding. waitUntil keeps the isolate alive for the async work.
		const work = (isMenu ? handleMenuEvent(event, body) : handleInboundMessage(event, body)).catch(
			(err) => console.error('[lark] handler error:', err)
		);
		const ctx = event.platform?.ctx;
		if (ctx?.waitUntil) ctx.waitUntil(work);
		else await work;
	} else {
		console.log(`[lark] event acknowledged (not handled): ${eventType}`);
	}

	return json({ ok: true });
};
