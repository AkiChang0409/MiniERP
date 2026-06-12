import type { RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createModuleContext } from '$platform/modules';
import { createLeaveApi, classifyHrIntent, hrAgentManifest } from '$modules/hr';
import { resolveCurrentPersonId } from '$platform/auth/resolve-current-person';
import {
	executeGuardedCapability,
	type GuardedCapabilityResult
} from '$platform/ai/execute-capability';
import { hashConfirmationPayload } from '$platform/workflow/payload-hash';

/**
 * Internal HR AI capability test console (Phase 1).
 *
 * Lives under /employee/* on purpose: that prefix is NOT module-gated, so ANY
 * authenticated user can open it. Per-capability authorization is therefore
 * proven by tool-policy (inside executeGuardedCapability), not by route gating —
 * e.g. a non-HR user gets `denied` on list/approve but can still self-submit.
 */

interface RunView {
	status: GuardedCapabilityResult['status'];
	auditId: string;
	riskLevel?: string;
	requiresConfirmation?: boolean;
	blockedBy?: string[];
	missingPermissions?: string[];
	error?: string;
	output?: unknown;
}

interface ConsoleResult {
	stage: 'result' | 'confirm' | 'error';
	message?: string;
	intent?: string;
	capabilityId?: string;
	params?: Record<string, unknown>;
	withConfirmation?: boolean;
	run?: RunView;
	error?: string;
}

function toRunView(res: GuardedCapabilityResult): RunView {
	const base = { status: res.status, auditId: res.auditId };
	if (res.status === 'ok') {
		return { ...base, riskLevel: res.decision.riskLevel, output: res.output };
	}
	if (res.status === 'denied') {
		return {
			...base,
			riskLevel: res.decision.riskLevel,
			requiresConfirmation: res.decision.requiresConfirmation,
			blockedBy: res.decision.blockedBy,
			missingPermissions: res.decision.missingUserPermissions
		};
	}
	return { ...base, riskLevel: res.decision.riskLevel, error: res.error };
}

const FINAL_ACTION: Record<string, string> = {
	'hr.list-pending-leave': 'hr.leave.listed',
	'hr.submit-leave-request': 'leave.submitted',
	'hr.approve-leave-request': 'leave.approved'
};

async function runCapability(
	event: RequestEvent,
	capabilityId: string,
	input: unknown,
	opts: { withConfirmation: boolean }
): Promise<RunView> {
	const ctx = await createModuleContext(event);
	const user = event.locals.user;

	// confirmationRef is only attached when the operator confirms. Without it, a
	// write capability is rejected by tool-policy BEFORE the service is touched.
	const confirmationRef = opts.withConfirmation
		? await hashConfirmationPayload({ capabilityId, input })
		: undefined;

	const res = await executeGuardedCapability({
		db: ctx.db,
		agentId: hrAgentManifest.id,
		agentVersion: hrAgentManifest.version,
		capabilityId,
		input,
		ctx: { tenantId: 'default', userId: user?.id, moduleContext: ctx },
		actor: { userId: user?.id, userEmail: user?.email, roles: user?.roles },
		confirmationRef,
		finalAction: FINAL_ACTION[capabilityId]
	});
	return toRunView(res);
}

export const load: PageServerLoad = async (event) => {
	const userEmail = event.locals.user?.email ?? null;
	const roles = event.locals.user?.roles ?? [];
	if (!event.platform) {
		return { userEmail, roles, boundPersonId: null, leaveTypes: [] };
	}
	const ctx = await createModuleContext(event);
	const [leaveTypes, boundPersonId] = await Promise.all([
		createLeaveApi(ctx).listLeaveTypes(),
		resolveCurrentPersonId(ctx.db, event.locals.user?.id)
	]);
	return { userEmail, roles, boundPersonId, leaveTypes };
};

export const actions: Actions = {
	// Step 1: parse the command. Read intents execute immediately; write intents
	// return parsed params for the confirmation form (no service call yet).
	interpret: async (event): Promise<ConsoleResult> => {
		const form = await event.request.formData();
		const message = String(form.get('message') ?? '').trim();
		if (!message) return { stage: 'error', error: 'Please enter a command.' };

		const intent = classifyHrIntent(message);

		if (intent.intent === 'unknown') {
			return {
				stage: 'error',
				message,
				error: '无法识别指令。试试：「查看待审批请假」/「提交请假 年假 2026-07-01 2026-07-03」/「批准请假 <id>」'
			};
		}

		if (intent.intent === 'list_pending_leave') {
			const run = await runCapability(event, intent.capabilityId, {}, { withConfirmation: false });
			return { stage: 'result', message, capabilityId: intent.capabilityId, run };
		}

		// submit_leave / approve_leave → confirmation stage (no execution yet).
		return {
			stage: 'confirm',
			message,
			intent: intent.intent,
			capabilityId: intent.capabilityId,
			params: intent.params
		};
	},

	// Step 2: execute a (possibly write) capability with the reviewed params.
	// `withConfirmation` toggles whether a confirmationRef is attached — leave it
	// off to watch a write be rejected with `confirmation_missing`.
	execute: async (event): Promise<ConsoleResult> => {
		const form = await event.request.formData();
		const capabilityId = String(form.get('capabilityId') ?? '').trim();
		const withConfirmation = form.get('withConfirmation') != null;

		let input: unknown;
		if (capabilityId === 'hr.submit-leave-request') {
			input = {
				leaveTypeId: String(form.get('leaveTypeId') ?? '').trim(),
				startDate: String(form.get('startDate') ?? '').trim(),
				endDate: String(form.get('endDate') ?? '').trim(),
				reason: String(form.get('reason') ?? '').trim() || undefined
			};
		} else if (capabilityId === 'hr.approve-leave-request') {
			input = {
				leaveRequestId: String(form.get('leaveRequestId') ?? '').trim(),
				comment: String(form.get('comment') ?? '').trim() || undefined
			};
		} else if (capabilityId === 'hr.list-pending-leave') {
			input = {};
		} else {
			return { stage: 'error', error: `Unknown capabilityId: ${capabilityId}` };
		}

		const run = await runCapability(event, capabilityId, input, { withConfirmation });
		return { stage: 'result', capabilityId, withConfirmation, run };
	}
};
