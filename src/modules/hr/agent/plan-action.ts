/**
 * HR domain planner (unified-agent merge, Step 2).
 *
 * Moves the mature HR leave logic that used to live in the Lark webhook route
 * into the module: LLM intent + input extraction (fallback rule-based), backend
 * leave-type resolution, and result rendering. The orchestrator calls
 * `planHrAction` after routing and executes / stages-for-confirmation the
 * returned `PlannedAction` through the governed runtime. The LLM only proposes
 * structure — identity is resolved server-side, and every write still goes
 * through tool-policy + confirmation + audit.
 */
import type { PlanActionArgs, PlannedAction, RenderResultArgs } from '$platform/ai/orchestrator';
import { createLeaveApi } from '../leave-api';
import { classifyHrIntent } from './intent-classifier';
import { classifyHrIntentLlm, type HrLlmIntent } from './llm-intent-classifier';
import { resolveLeaveType, type LeaveTypeLike } from './leave-type-resolver';
import { summarizeHrResult } from './llm-summarizer';
import { hrAgentAllowedCapabilities } from './policy';

const LLM_MIN_CONFIDENCE = 0.6;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED = new Set(hrAgentAllowedCapabilities.map((e) => e.id));

const HELP_TEXT = [
	'我可以帮你处理请假：',
	'• 查看待审批请假',
	'• 提交请假（说明类型/开始/结束日期，例如：我要请年假 2026-07-20 到 2026-07-22）',
	'• 批准请假 <leaveRequestId>'
].join('\n');

/** Today in Asia/Singapore (UTC+8, no DST) — anchors relative-date parsing. */
function currentDateInfo(): { currentDate: string; timezone: string } {
	const sg = new Date(Date.now() + 8 * 60 * 60 * 1000);
	return { currentDate: sg.toISOString().slice(0, 10), timezone: 'Asia/Singapore (UTC+8)' };
}

interface HrDispatch {
	capabilityId: string | null;
	leaveTypeRef?: string;
	startDate?: string;
	endDate?: string;
	reason?: string;
	leaveRequestId?: string;
	comment?: string;
	missingFields: string[];
}

function fromLlm(llm: HrLlmIntent): HrDispatch {
	return {
		capabilityId: llm.capabilityId,
		leaveTypeRef: llm.input.leaveTypeRef ?? undefined,
		startDate: llm.input.startDate ?? undefined,
		endDate: llm.input.endDate ?? undefined,
		reason: llm.input.reason ?? undefined,
		leaveRequestId: llm.input.leaveRequestId ?? undefined,
		comment: llm.input.comment ?? undefined,
		missingFields: llm.missingFields ?? []
	};
}

function fromRule(text: string): HrDispatch {
	const r = classifyHrIntent(text);
	if (r.intent === 'submit_leave') {
		return {
			capabilityId: 'hr.submit-leave-request',
			leaveTypeRef: r.params.leaveTypeCode,
			startDate: r.params.startDate,
			endDate: r.params.endDate,
			reason: r.params.reason,
			missingFields: []
		};
	}
	if (r.intent === 'approve_leave') {
		return {
			capabilityId: 'hr.approve-leave-request',
			leaveRequestId: r.params.leaveRequestId,
			missingFields: []
		};
	}
	if (r.intent === 'list_pending_leave') {
		return { capabilityId: 'hr.list-pending-leave', missingFields: [] };
	}
	return { capabilityId: null, missingFields: [] };
}

export async function planHrAction(args: PlanActionArgs): Promise<PlannedAction> {
	const { env, moduleContext: mc, message } = args;
	const text = message.text.trim();

	const leaveTypes = (await createLeaveApi(mc).listLeaveTypes()) as LeaveTypeLike[];
	const { currentDate, timezone } = currentDateInfo();
	const llm = await classifyHrIntentLlm(env, text, {
		leaveTypes: leaveTypes.map((t) => ({ code: t.code, name: t.name })),
		currentDate,
		timezone
	});

	const dispatch =
		llm && llm.confidence >= LLM_MIN_CONFIDENCE && llm.capabilityId ? fromLlm(llm) : fromRule(text);

	if (!dispatch.capabilityId || !ALLOWED.has(dispatch.capabilityId)) {
		return { kind: 'unknown', message: `暂不支持该操作。\n${HELP_TEXT}` };
	}
	if (dispatch.missingFields.length > 0) {
		return { kind: 'clarification', message: `还需要补充：${dispatch.missingFields.join('、')}。请补充后再说一次。` };
	}

	if (dispatch.capabilityId === 'hr.list-pending-leave') {
		return { kind: 'read', capabilityId: 'hr.list-pending-leave', input: {}, finalAction: 'hr.leave.listed' };
	}

	if (dispatch.capabilityId === 'hr.submit-leave-request') {
		const match = resolveLeaveType(leaveTypes, dispatch.leaveTypeRef ?? '');
		if (!match) {
			return {
				kind: 'clarification',
				message: `未找到请假类型「${dispatch.leaveTypeRef || '(未提供)'}」。可用：${leaveTypes
					.map((t) => `${t.name}(${t.code})`)
					.join('、')}`
			};
		}
		const start = dispatch.startDate ?? '';
		const end = dispatch.endDate ?? '';
		if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) {
			return {
				kind: 'clarification',
				message: '提交请假需要开始/结束日期(YYYY-MM-DD)。例如：我要请年假 2026-07-20 到 2026-07-22'
			};
		}
		return {
			kind: 'write',
			capabilityId: 'hr.submit-leave-request',
			input: { leaveTypeId: match.id, startDate: start, endDate: end, reason: dispatch.reason },
			summary: `提交请假：${match.name} ${start}~${end}${dispatch.reason ? ` 原因:${dispatch.reason}` : ''}`,
			finalAction: 'leave.submitted'
		};
	}

	// hr.approve-leave-request
	const leaveRequestId = (dispatch.leaveRequestId ?? '').trim();
	if (!leaveRequestId) {
		return { kind: 'clarification', message: '请提供请假单号。例如：批准请假 lr-xxxxxx' };
	}
	return {
		kind: 'write',
		capabilityId: 'hr.approve-leave-request',
		input: { leaveRequestId, comment: dispatch.comment },
		summary: `批准请假：${leaveRequestId}${dispatch.comment ? ` 备注:${dispatch.comment}` : ''}`,
		finalAction: 'leave.approved'
	};
}

// ---------------------------------------------------------------------------
// Result rendering (LLM summary with a fixed-template fallback).
// ---------------------------------------------------------------------------

function templateFor(capabilityId: string, output: unknown): string {
	const out = (output ?? {}) as Record<string, unknown>;
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

export async function renderHrResult(args: RenderResultArgs): Promise<string> {
	const summary = await summarizeHrResult(args.env, {
		capabilityId: args.capabilityId,
		result: args.output,
		userText: ''
	}).catch(() => null);
	return summary ?? templateFor(args.capabilityId, args.output);
}
