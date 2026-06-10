import { runGovernedCapability, type GovernedRunContext } from '../ai/governed-capability';
import { getWorkflow } from './workflow-registry';
import { getState, patchState, type WorkflowStateRecord } from './workflow-runtime';

/**
 * Generic, registry-driven workflow step driver. Knows nothing about any
 * specific domain: it reads the registered definition, validates the
 * transition, runs the target step's capabilities through the governed
 * capability path (policy gate + audit centralized there), folds the outputs
 * into state via the definition's `applyStepResult` hook, and persists.
 *
 * Zero `$modules/*` imports → lives in platform, reusable for any workflow
 * (single-domain or cross-module) and microservice-ready.
 */
export type AdvanceInstanceResult =
	| { ok: true; state: WorkflowStateRecord }
	| { ok: false; status: number; message: string; details?: unknown };

export interface AdvanceInstanceArgs {
	kv: KVNamespace;
	instanceId: string;
	targetStep: string;
	payload?: unknown;
	/** Governance context for capability execution (agent id, user, db, ...). */
	run: Omit<GovernedRunContext, 'workflowId' | 'workflowStep' | 'currentStepAllowedCapabilities'>;
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

	const input = def.resolveStepInput
		? await def.resolveStepInput({ state, targetStep, payload })
		: payload;

	const outputs: unknown[] = [];
	for (const capabilityId of targetStepDef.capabilities) {
		const result = await runGovernedCapability(capabilityId, input, {
			...run,
			workflowId: state.id,
			workflowStep: targetStep,
			currentStepAllowedCapabilities: targetStepDef.capabilities
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
}
