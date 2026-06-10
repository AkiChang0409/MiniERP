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
import { parseLarkCommand } from '$platform/integrations/lark/commands';
import { createLeaveApi, hrAgentManifest } from '$modules/hr';

/**
 * Lark (Feishu) event webhook — Phase 3B/3C: 3 HR leave commands, minimal loop.
 *
 *   查看待审批请假                                 → hr.list-pending-leave (read)
 *   提交请假 <类型> <开始> <结束> [原因]            → hr.submit-leave-request (write)
 *   批准请假 <leaveRequestId> [备注]               → hr.approve-leave-request (write)
 *
 * Writes use a text confirmation loop: the first command stores a pending action
 * in KV and replies with a confirm code; the user must reply `确认 <code>` to
 * execute (`取消` to drop it). The code is derived from the confirmationRef, so a
 * wrong/missing code never reaches the service. All dispatch goes through
 * `executeGuardedCapability` (policy + audit); the actor is the MiniERP user
 * resolved from the Lark open_id via `external_identity_links`. No service/repo/
 * db access, no `fetch('/api/...')` — capabilities call the HR facade.
 */

const LARK_PROVIDER = 'lark';
const PENDING_TTL_SECONDS = 600;

function pendingKey(openId: string): string {
	return `lark:pending:${openId}`;
}

interface PendingAction {
	capabilityId: string;
	input: Record<string, unknown>;
	confirmationRef: string;
	summary: string;
}

const FINAL_ACTION: Record<string, string> = {
	'hr.list-pending-leave': 'hr.leave.listed',
	'hr.submit-leave-request': 'leave.submitted',
	'hr.approve-leave-request': 'leave.approved'
};

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

const HELP_TEXT = [
	'可用命令：',
	'• 查看待审批请假',
	'• 提交请假 <类型> <开始日期> <结束日期> [原因]   (例: 提交请假 年假 2026-07-01 2026-07-03 家庭事务)',
	'• 批准请假 <leaveRequestId> [备注]'
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

	const cmd = parseLarkCommand(userText);

	switch (cmd.kind) {
		case 'list_pending': {
			const res = await runCapability(mc, resolved, 'hr.list-pending-leave', {}, undefined);
			await send(formatResult('hr.list-pending-leave', res));
			return;
		}

		case 'cancel': {
			await env.KV.delete(pendingKey(openId));
			await send('已取消待确认的操作。');
			return;
		}

		case 'confirm': {
			const raw = await env.KV.get(pendingKey(openId));
			if (!raw) {
				await send('没有待确认的操作。');
				return;
			}
			const pending = JSON.parse(raw) as PendingAction;
			const expectedCode = pending.confirmationRef.slice(0, 6);
			if (!cmd.code || cmd.code.toLowerCase() !== expectedCode.toLowerCase()) {
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
			await send(formatResult(pending.capabilityId, res));
			return;
		}

		case 'submit': {
			// Resolve the leave-type ref (name / code / id) → id via the HR facade.
			const types = await createLeaveApi(mc).listLeaveTypes();
			const ref = cmd.leaveTypeRef;
			const match = types.find(
				(t) =>
					t.id === ref ||
					t.code.toLowerCase() === ref.toLowerCase() ||
					t.name.toLowerCase() === ref.toLowerCase()
			);
			if (!match) {
				await send(
					`未找到请假类型「${ref}」。可用：${types.map((t) => `${t.name}(${t.code})`).join('、')}`
				);
				return;
			}
			const input: Record<string, unknown> = {
				leaveTypeId: match.id,
				startDate: cmd.startDate,
				endDate: cmd.endDate,
				reason: cmd.reason
			};
			const confirmationRef = await hashConfirmationPayload(input);
			const summary = `提交请假：${match.name} ${cmd.startDate}~${cmd.endDate}${
				cmd.reason ? ` 原因:${cmd.reason}` : ''
			}`;
			const pending: PendingAction = {
				capabilityId: 'hr.submit-leave-request',
				input,
				confirmationRef,
				summary
			};
			await env.KV.put(pendingKey(openId), JSON.stringify(pending), {
				expirationTtl: PENDING_TTL_SECONDS
			});
			await send(`${summary}\n回复「确认 ${confirmationRef.slice(0, 6)}」执行，或「取消」放弃。`);
			return;
		}

		case 'approve': {
			const input: Record<string, unknown> = {
				leaveRequestId: cmd.leaveRequestId,
				comment: cmd.comment
			};
			const confirmationRef = await hashConfirmationPayload(input);
			const summary = `批准请假：${cmd.leaveRequestId}${cmd.comment ? ` 备注:${cmd.comment}` : ''}`;
			const pending: PendingAction = {
				capabilityId: 'hr.approve-leave-request',
				input,
				confirmationRef,
				summary
			};
			await env.KV.put(pendingKey(openId), JSON.stringify(pending), {
				expirationTtl: PENDING_TTL_SECONDS
			});
			await send(`${summary}\n回复「确认 ${confirmationRef.slice(0, 6)}」执行，或「取消」放弃。`);
			return;
		}

		default: {
			await send(HELP_TEXT);
			return;
		}
	}
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

	// --- Signature verification skeleton (only relevant once Encrypt Key is on) ---
	// When an Encrypt Key is configured, Lark signs each request:
	//   X-Lark-Signature = sha256(timestamp + nonce + encryptKey + rawBody)
	// With no Encrypt Key, Lark does not sign; we authenticate via the verification
	// token below.

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
