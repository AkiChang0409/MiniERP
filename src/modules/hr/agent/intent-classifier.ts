/**
 * Rule-based HR intent classifier (Phase 1 — no LLM).
 *
 * Maps a free-text command to one of the three leave capabilities and extracts
 * coarse parameters. Param extraction is best-effort; the test console shows a
 * confirmation form where the user reviews/edits before any write executes.
 */

export type HrIntentResult =
	| {
			intent: 'list_pending_leave';
			capabilityId: 'hr.list-pending-leave';
			needsConfirmation: false;
			params: Record<string, never>;
	  }
	| {
			intent: 'submit_leave';
			capabilityId: 'hr.submit-leave-request';
			needsConfirmation: true;
			params: { leaveTypeCode?: string; startDate?: string; endDate?: string; reason?: string };
	  }
	| {
			intent: 'approve_leave';
			capabilityId: 'hr.approve-leave-request';
			needsConfirmation: true;
			params: { leaveRequestId?: string; comment?: string };
	  }
	| { intent: 'unknown'; capabilityId: null; needsConfirmation: false; params: Record<string, never> };

const DATE_RE = /\d{4}-\d{2}-\d{2}/g;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function detectLeaveTypeCode(text: string): string | undefined {
	const t = text.toLowerCase();
	if (t.includes('年假') || t.includes('annual')) return 'ANNUAL';
	if (t.includes('病假') || t.includes('sick')) return 'SICK';
	if (t.includes('住院') || t.includes('hosp')) return 'HOSP';
	if (t.includes('无薪') || t.includes('unpaid')) return 'UNPAID';
	return undefined;
}

export function classifyHrIntent(message: string): HrIntentResult {
	const text = (message ?? '').trim();
	const lower = text.toLowerCase();
	const mentionsLeave = text.includes('请假') || lower.includes('leave');

	// 1) Approve — requires an explicit approve verb.
	if (text.includes('批准') || text.includes('通过') || lower.includes('approve')) {
		const leaveRequestId = text.match(UUID_RE)?.[0];
		return {
			intent: 'approve_leave',
			capabilityId: 'hr.approve-leave-request',
			needsConfirmation: true,
			params: { leaveRequestId }
		};
	}

	// 2) List pending.
	const wantsList =
		text.includes('待审批') ||
		text.includes('查看') ||
		lower.includes('pending') ||
		lower.includes('list');
	if (wantsList && mentionsLeave) {
		return {
			intent: 'list_pending_leave',
			capabilityId: 'hr.list-pending-leave',
			needsConfirmation: false,
			params: {}
		};
	}

	// 3) Submit.
	const wantsSubmit =
		text.includes('提交') || text.includes('申请') || lower.includes('submit') || lower.includes('apply');
	if (wantsSubmit && mentionsLeave) {
		const dates = text.match(DATE_RE) ?? [];
		return {
			intent: 'submit_leave',
			capabilityId: 'hr.submit-leave-request',
			needsConfirmation: true,
			params: {
				leaveTypeCode: detectLeaveTypeCode(text),
				startDate: dates[0],
				endDate: dates[1] ?? dates[0]
			}
		};
	}

	return { intent: 'unknown', capabilityId: null, needsConfirmation: false, params: {} };
}
