import { json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { fail } from '$platform/http';
import { createModuleContext } from '$platform/modules';
import type { ModuleContext } from '$platform/modules/types';
import {
	resolveUserByExternalIdentity,
	type ResolvedExternalUser
} from '$platform/auth/resolve-external-identity';
import {
	executeGuardedCapability,
	type GuardedCapabilityResult
} from '$platform/ai/execute-capability';
import { hashConfirmationPayload } from '$platform/workflow/payload-hash';
import { sendTextMessage } from '$platform/integrations/lark/client';
import { parseLarkCommand, type LarkCommand } from '$platform/integrations/lark/commands';
import {
	createLeaveApi,
	hrAgentManifest,
	hrAgentAllowedCapabilities,
	classifyHrIntentLlm,
	summarizeHrResult,
	resolveLeaveType,
	type HrLlmIntent
} from '$modules/hr';

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
const PENDING_TTL_SECONDS = 600;
/** Below this LLM confidence we fall back to the deterministic rule-based parser. */
const LLM_MIN_CONFIDENCE = 0.6;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** System-authoritative allow-list (LLM-proposed ids are validated against this). */
const ALLOWED_CAPABILITY_IDS = new Set(hrAgentAllowedCapabilities.map((e) => e.id));

const FINAL_ACTION: Record<string, string> = {
	'hr.list-pending-leave': 'hr.leave.listed',
	'hr.submit-leave-request': 'leave.submitted',
	'hr.approve-leave-request': 'leave.approved'
};

function pendingKey(openId: string): string {
	return `lark:pending:${openId}`;
}

interface PendingAction {
	capabilityId: string;
	input: Record<string, unknown>;
	confirmationRef: string;
	summary: string;
}

interface Dispatch {
	capabilityId: string | null;
	input: {
		leaveTypeRef?: string;
		startDate?: string;
		endDate?: string;
		reason?: string;
		leaveRequestId?: string;
		comment?: string;
	};
	missingFields: string[];
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

/** Length-safe constant-time string compare (avoids token-length/timing leaks). */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let mismatch = 0;
	for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return mismatch === 0;
}

/** Today in Asia/Singapore (UTC+8, no DST) — anchors relative-date parsing. */
function currentDateInfo(): { currentDate: string; timezone: string } {
	const sg = new Date(Date.now() + 8 * 60 * 60 * 1000);
	return { currentDate: sg.toISOString().slice(0, 10), timezone: 'Asia/Singapore (UTC+8)' };
}

function llmToDispatch(llm: HrLlmIntent): Dispatch {
	return {
		capabilityId: llm.capabilityId,
		input: {
			leaveTypeRef: llm.input.leaveTypeRef ?? undefined,
			startDate: llm.input.startDate ?? undefined,
			endDate: llm.input.endDate ?? undefined,
			reason: llm.input.reason ?? undefined,
			leaveRequestId: llm.input.leaveRequestId ?? undefined,
			comment: llm.input.comment ?? undefined
		},
		missingFields: llm.missingFields ?? []
	};
}

/** Rule-based fallback → dispatch (confirm/cancel are handled before this). */
function commandToDispatch(cmd: LarkCommand): Dispatch | null {
	switch (cmd.kind) {
		case 'list_pending':
			return { capabilityId: 'hr.list-pending-leave', input: {}, missingFields: [] };
		case 'submit':
			return {
				capabilityId: 'hr.submit-leave-request',
				input: {
					leaveTypeRef: cmd.leaveTypeRef,
					startDate: cmd.startDate,
					endDate: cmd.endDate,
					reason: cmd.reason
				},
				missingFields: []
			};
		case 'approve':
			return {
				capabilityId: 'hr.approve-leave-request',
				input: { leaveRequestId: cmd.leaveRequestId, comment: cmd.comment },
				missingFields: []
			};
		default:
			return null;
	}
}

async function runCapability(
	mc: ModuleContext,
	actor: ResolvedExternalUser,
	capabilityId: string,
	input: unknown,
	confirmationRef: string | undefined
): Promise<GuardedCapabilityResult> {
	return executeGuardedCapability({
		db: mc.db,
		agentId: hrAgentManifest.id,
		agentVersion: hrAgentManifest.version,
		capabilityId,
		input,
		ctx: { tenantId: 'default', userId: actor.id, moduleContext: mc },
		actor: { userId: actor.id, userEmail: actor.email, roles: actor.roles },
		confirmationRef,
		finalAction: FINAL_ACTION[capabilityId]
	});
}

/** Fixed-template rendering — used for non-ok results and as the summarizer fallback. */
function formatResult(capabilityId: string, res: GuardedCapabilityResult): string {
	if (res.status === 'denied') {
		const missing = res.decision.missingUserPermissions;
		return `操作被拒绝（${res.decision.blockedBy.join(', ')}）${
			missing.length ? `，缺少权限：${missing.join(', ')}` : ''
		}。`;
	}
	if (res.status !== 'ok') {
		return `执行失败：${res.error}`;
	}
	const out = (res.output ?? {}) as Record<string, unknown>;
	if (capabilityId === 'hr.list-pending-leave') {
		const requests = (out.requests as Array<Record<string, unknown>>) ?? [];
		if (requests.length === 0) return '当前没有待审批的请假。';
		const lines = requests.map(
			(r) =>
				`• ${r.personName ?? r.personId} ${r.leaveTypeName ?? ''} ${r.startDate}~${r.endDate} (${r.totalDays}天) id=${r.id}`
		);
		return `待审批请假（${requests.length}）：\n${lines.join('\n')}`;
	}
	if (capabilityId === 'hr.submit-leave-request') {
		return `已提交请假，单号 ${out.id}，共 ${out.totalDays} 天，状态 ${out.status}。`;
	}
	if (capabilityId === 'hr.approve-leave-request') {
		return `已批准请假 ${out.leaveRequestId}。`;
	}
	return '完成。';
}

/**
 * Reply for an executed result: ok → LLM summary (grounded on result) with a
 * fixed-template fallback; denied / failed / validation → always fixed template.
 */
async function replyForResult(
	env: Env,
	capabilityId: string,
	res: GuardedCapabilityResult,
	userText: string
): Promise<string> {
	if (res.status !== 'ok') return formatResult(capabilityId, res);
	const summary = await summarizeHrResult(env, { capabilityId, result: res.output, userText }).catch(
		() => null
	);
	return summary ?? formatResult(capabilityId, res);
}

const HELP_TEXT = [
	'我可以帮你处理请假：',
	'• 查看待审批请假',
	'• 提交请假（说明类型/开始/结束日期，例如：我要请年假 2026-07-20 到 2026-07-22）',
	'• 批准请假 <leaveRequestId>'
].join('\n');

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

	// --- Deterministic confirm / cancel (never via LLM; fixed templates) ---
	const quick = parseLarkCommand(userText);
	if (quick.kind === 'cancel') {
		await env.KV.delete(pendingKey(openId));
		await send('已取消待确认的操作。');
		return;
	}
	if (quick.kind === 'confirm') {
		const raw = await env.KV.get(pendingKey(openId));
		if (!raw) {
			await send('没有待确认的操作。');
			return;
		}
		const pending = JSON.parse(raw) as PendingAction;
		const expectedCode = pending.confirmationRef.slice(0, 6);
		if (!quick.code || quick.code.toLowerCase() !== expectedCode.toLowerCase()) {
			// Wrong/missing token → never reaches the service.
			await send(`确认码不正确，未执行。请回复「确认 ${expectedCode}」。`);
			return;
		}
		const res = await runCapability(
			mc,
			resolved,
			pending.capabilityId,
			pending.input,
			pending.confirmationRef
		);
		await env.KV.delete(pendingKey(openId));
		await send(await replyForResult(env, pending.capabilityId, res, pending.summary));
		return;
	}

	// --- Tool-aware intent (LLM first, rule-based fallback) ---
	const leaveTypes = await createLeaveApi(mc).listLeaveTypes();
	const { currentDate, timezone } = currentDateInfo();
	const llm = await classifyHrIntentLlm(env, userText, {
		leaveTypes: leaveTypes.map((t) => ({ code: t.code, name: t.name })),
		currentDate,
		timezone
	});

	let dispatch: Dispatch | null;
	if (llm && llm.confidence >= LLM_MIN_CONFIDENCE && llm.capabilityId) {
		dispatch = llmToDispatch(llm);
		console.log(
			`[lark] LLM cap=${llm.capabilityId} conf=${llm.confidence} missing=[${llm.missingFields.join(',')}]`
		);
	} else {
		dispatch = commandToDispatch(parseLarkCommand(userText));
		console.log(
			`[lark] rule-based fallback cap=${dispatch?.capabilityId ?? 'none'} (llm=${llm ? `${llm.intent}/${llm.confidence}` : 'null'})`
		);
	}

	if (!dispatch?.capabilityId || !ALLOWED_CAPABILITY_IDS.has(dispatch.capabilityId)) {
		await send(`暂不支持该操作。\n${HELP_TEXT}`);
		return;
	}

	// Missing required fields (LLM-reported) → ask, do not execute.
	if (dispatch.missingFields.length > 0) {
		await send(`还需要补充：${dispatch.missingFields.join('、')}。请补充后再说一次。`);
		return;
	}

	// --- list (read): execute now, summarize the result ---
	if (dispatch.capabilityId === 'hr.list-pending-leave') {
		const res = await runCapability(mc, resolved, 'hr.list-pending-leave', {}, undefined);
		await send(await replyForResult(env, 'hr.list-pending-leave', res, userText));
		return;
	}

	// --- submit (write): backend-resolve leave type, then confirmation loop ---
	if (dispatch.capabilityId === 'hr.submit-leave-request') {
		const ref = dispatch.input.leaveTypeRef ?? '';
		const match = resolveLeaveType(leaveTypes, ref);
		if (!match) {
			await send(
				`未找到请假类型「${ref || '(未提供)'}」。可用：${leaveTypes.map((t) => `${t.name}(${t.code})`).join('、')}`
			);
			return;
		}
		const start = dispatch.input.startDate ?? '';
		const end = dispatch.input.endDate ?? '';
		if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) {
			await send('提交请假需要开始/结束日期(YYYY-MM-DD)。例如：我要请年假 2026-07-20 到 2026-07-22');
			return;
		}
		const input: Record<string, unknown> = {
			leaveTypeId: match.id,
			startDate: start,
			endDate: end,
			reason: dispatch.input.reason
		};
		const confirmationRef = await hashConfirmationPayload(input);
		const summary = `提交请假：${match.name} ${start}~${end}${
			dispatch.input.reason ? ` 原因:${dispatch.input.reason}` : ''
		}`;
		await env.KV.put(
			pendingKey(openId),
			JSON.stringify({ capabilityId: 'hr.submit-leave-request', input, confirmationRef, summary }),
			{ expirationTtl: PENDING_TTL_SECONDS }
		);
		await send(`${summary}\n回复「确认 ${confirmationRef.slice(0, 6)}」执行，或「取消」放弃。`);
		return;
	}

	// --- approve (write): confirmation loop ---
	if (dispatch.capabilityId === 'hr.approve-leave-request') {
		const leaveRequestId = (dispatch.input.leaveRequestId ?? '').trim();
		if (!leaveRequestId) {
			await send('请提供请假单号。例如：批准请假 lr-xxxxxx');
			return;
		}
		const input: Record<string, unknown> = {
			leaveRequestId,
			comment: dispatch.input.comment
		};
		const confirmationRef = await hashConfirmationPayload(input);
		const summary = `批准请假：${leaveRequestId}${dispatch.input.comment ? ` 备注:${dispatch.input.comment}` : ''}`;
		await env.KV.put(
			pendingKey(openId),
			JSON.stringify({ capabilityId: 'hr.approve-leave-request', input, confirmationRef, summary }),
			{ expirationTtl: PENDING_TTL_SECONDS }
		);
		await send(`${summary}\n回复「确认 ${confirmationRef.slice(0, 6)}」执行，或「取消」放弃。`);
		return;
	}

	await send(`暂不支持该操作。\n${HELP_TEXT}`);
}

export const POST: RequestHandler = async (event) => {
	const expectedToken = event.platform?.env?.LARK_VERIFICATION_TOKEN;
	if (!expectedToken) {
		// Server misconfiguration — surface it rather than silently 200.
		// (Run `npm run dev:cf` so `.dev.vars` is injected into the Worker env.)
		return fail('LARK_VERIFICATION_TOKEN is not configured on the server', 500);
	}

	const rawBody = await event.request.text();
	let body: Record<string, unknown>;
	try {
		body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
	} catch {
		return fail('Invalid JSON body', 400);
	}

	// --- Encrypted mode (LARK_ENCRYPT_KEY) — not supported yet ---
	if ('encrypt' in body) {
		return fail(
			'Encrypted Lark callbacks are not supported yet. Leave the Encrypt Key unset in the Lark console, or implement AES-256-CBC decrypt + set LARK_ENCRYPT_KEY.',
			501
		);
	}

	// --- 1) URL verification handshake ---
	if (asString(body.type) === 'url_verification') {
		const token = asString(body.token);
		if (!token || !timingSafeEqual(token, expectedToken)) {
			return fail('Invalid verification token', 401);
		}
		const challenge = asString(body.challenge);
		if (!challenge) {
			return fail('Missing challenge', 400);
		}
		// Lark expects exactly { "challenge": "<value>" } — not the app's ok() envelope.
		return json({ challenge });
	}

	// --- 2) Event callback — verify token, then handle ---
	// schema 2.0 → header.token; legacy v1 → top-level token.
	const header = body.header as Record<string, unknown> | undefined;
	const token = asString(header?.token) ?? asString(body.token);
	if (!token || !timingSafeEqual(token, expectedToken)) {
		return fail('Invalid verification token', 401);
	}

	const eventType = asString(header?.event_type) ?? 'unknown';

	if (eventType === 'im.message.receive_v1' && event.platform?.env) {
		// ACK fast; do the work (identity resolve, capability, reply) after responding.
		const work = handleLarkMessage(event, body).catch((err) =>
			console.error('[lark] handler error:', err)
		);
		const ctx = event.platform?.ctx;
		if (ctx?.waitUntil) ctx.waitUntil(work);
		else await work;
	} else {
		console.log(`[lark] event acknowledged (not handled): ${eventType}`);
	}

	return json({ ok: true });
};
