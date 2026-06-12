import type { DBClient } from '$infrastructure/db';
import { appendAgentAuditEntry } from '../audit/audit-log';
import { runGovernedCapability } from '../ai/governed-capability';
import { getWorkflow, listWorkflows, WorkflowStepError } from './workflow-registry';
import { getState, patchState, startWorkflow, type WorkflowStateRecord } from './workflow-runtime';

/**
 * Generic, registry-driven workflow engine. Knows nothing about any specific
 * domain: it reads the registered definition, validates the transition, runs
 * the target step's capabilities through the governed capability path (policy
 * gate + audit centralized there), folds the outputs into state via the
 * definition's `applyStepResult` hook, and persists.
 *
 * Zero `$modules/*` imports → lives in platform, reusable for any workflow
 * (single-domain or cross-module) and microservice-ready.
 */

/** Caller-supplied identity/runtime for capability execution. Tenant + the
 * per-capability context are derived by the engine from the loaded state. */
export interface WorkflowRunIdentity {
	agentId: string;
	agentVersion: string;
	user: App.Locals['user'];
	db: DBClient;
	env: Env;
	useMock?: boolean;
	/**
	 * Opaque per-request service ports forwarded into each capability's
	 * execution context (`capabilityCtx.deps`). The engine never interprets
	 * this — a module composition root (e.g. the finance advance route) supplies
	 * its own typed deps, keeping the engine domain-agnostic.
	 */
	capabilityDeps?: unknown;
}

export type StartInstanceResult =
	| { ok: true; state: WorkflowStateRecord }
	| { ok: false; status: number; message: string };

export interface StartInstanceArgs {
	kv: KVNamespace;
	db: DBClient;
	workflowId: string;
	agentId: string;
	agentVersion: string;
	userId: string;
	userEmail: string | null;
	tenantId: string;
	data?: Record<string, unknown>;
}

export async function startInstance(args: StartInstanceArgs): Promise<StartInstanceResult> {
	const def = getWorkflow(args.workflowId);
	if (!def) {
		return {
			ok: false,
			status: 400,
			message: `Unsupported workflowId: ${args.workflowId}. Supported: ${listWorkflows()
				.map((d) => d.id)
				.join(', ')}.`
		};
	}
	const state = await startWorkflow(args.kv, {
		workflowId: def.id,
		agentId: args.agentId,
		initialStep: def.initialStep,
		userId: args.userId,
		tenantId: args.tenantId,
		data: args.data
	});
	await appendAgentAuditEntry(args.db, {
		agentId: args.agentId,
		agentVersion: args.agentVersion,
		userId: args.userId,
		userEmail: args.userEmail,
		tenantId: args.tenantId,
		workflowId: state.id,
		workflowStep: state.step,
		riskLevel: 'R0',
		permissionResult: 'allowed',
		confirmationRequired: false,
		finalAction: 'agent.workflow_started',
		status: 'ok'
	});
	return { ok: true, state };
}

export type AdvanceInstanceResult =
	| { ok: true; state: WorkflowStateRecord }
	| { ok: false; status: number; message: string; details?: unknown };

export interface AdvanceInstanceArgs {
	kv: KVNamespace;
	instanceId: string;
	targetStep: string;
	payload?: unknown;
	run: WorkflowRunIdentity;
}

export async function advanceInstance(args: AdvanceInstanceArgs): Promise<AdvanceInstanceResult> {
	const { kv, instanceId, targetStep, payload, run } = args;

	const state = await getState(kv, instanceId);
	if (!state) return { ok: false, status: 404, message: 'Workflow not found' };
	if (state.status !== 'active') {
		return { ok: false, status: 409, message: `Workflow is ${state.status}` };
	}

	const def = getWorkflow(state.workflowId);
	if (!def) {
		return {
			ok: false,
			status: 500,
			message: `Workflow definition not registered: ${state.workflowId}`
		};
	}

	const currentStep = def.steps.find((s) => s.id === state.step);
	if (!currentStep) return { ok: false, status: 500, message: `Unknown current step: ${state.step}` };
	if (!currentStep.nextSteps.includes(targetStep)) {
		return {
			ok: false,
			status: 400,
			message: `Cannot advance from ${state.step} to ${targetStep}. Allowed: ${currentStep.nextSteps.join(', ') || '(none)'}.`
		};
	}

	const targetStepDef = def.steps.find((s) => s.id === targetStep);
	if (!targetStepDef) return { ok: false, status: 400, message: `Unknown target step: ${targetStep}` };

	const capabilityCtx = {
		tenantId: state.tenantId,
		userId: state.userId,
		useMock: run.useMock ?? true,
		env: run.env,
		deps: run.capabilityDeps
	};

	try {
		const input = def.resolveStepInput
			? await def.resolveStepInput({
					state,
					targetStep,
					payload,
					runtime: { env: run.env, db: run.db, user: run.user }
				})
			: payload;

		const outputs: unknown[] = [];
		for (const capabilityId of targetStepDef.capabilities) {
			const result = await runGovernedCapability(capabilityId, input, {
				agentId: run.agentId,
				agentVersion: run.agentVersion,
				userId: run.user?.id ?? null,
				userEmail: run.user?.email ?? null,
				userRoles: run.user?.roles,
				tenantId: state.tenantId,
				workflowId: state.id,
				workflowStep: targetStep,
				currentStepAllowedCapabilities: targetStepDef.capabilities,
				db: run.db,
				capabilityCtx
			});
			if (!result.ok) {
				return {
					ok: false,
					status: 403,
					message: `Policy denied for ${capabilityId}: ${result.decision.blockedBy.join(', ')}`,
					details: result.decision
				};
			}
			outputs.push(result.output);
		}

		const applied = def.applyStepResult
			? await def.applyStepResult({ state, targetStep, payload, outputs })
			: {};

		const next = await patchState(kv, state.id, {
			step: targetStep,
			dataPatch: applied.dataPatch,
			status: applied.status
		});

		return { ok: true, state: next };
	} catch (err) {
		if (err instanceof WorkflowStepError) {
			return { ok: false, status: err.status, message: err.message };
		}
		throw err;
	}
}
