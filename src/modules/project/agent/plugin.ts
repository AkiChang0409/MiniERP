/**
 * Project domain-agent plugin — generic projection for the unified orchestrator.
 * Wraps the existing manifest + intent classifier + policy. Project capabilities
 * are all read-only / suggestive (R0–R1); writes stay on the deterministic
 * `createProjectApi` path until governed write capabilities land (plan Phase 8).
 */
import type {
	AgentIntentResult,
	ApplyRequest,
	BuildApplyRequestArgs,
	DomainAgentPlugin,
	IntentClassificationInput
} from '$platform/ai/orchestrator';
import { projectAgentManifest } from './manifest';
import { classifyProjectIntent } from './intent-classifier';
import { projectAgentAllowedCapabilities } from './policy';

export const projectAgentPlugin: DomainAgentPlugin = {
	manifest: {
		id: projectAgentManifest.id,
		name: projectAgentManifest.name,
		domain: projectAgentManifest.domain,
		version: projectAgentManifest.version,
		description: projectAgentManifest.description,
		owns: projectAgentManifest.owns,
		canHandle: projectAgentManifest.canHandle,
		cannotHandle: projectAgentManifest.cannotHandle,
		defaultRiskLevel: projectAgentManifest.defaultRiskLevel,
		forbiddenActions: projectAgentManifest.forbiddenActions
	},
	allowedCapabilityIds: projectAgentAllowedCapabilities.map((entry) => entry.id),
	classifyIntent(input: IntentClassificationInput): AgentIntentResult | null {
		const result = classifyProjectIntent({
			message: input.message,
			currentPath: input.currentPath
		});
		if (result.intent === 'unknown') return null;
		return {
			agentId: projectAgentManifest.id,
			domain: projectAgentManifest.domain,
			intent: result.intent,
			confidence: result.confidence,
			reason: result.reason,
			riskLevel: result.riskLevel,
			requiredInputs: result.requiredInputs,
			suggestedCapabilityId: result.suggestedCapabilityId,
			suggestedWorkflowId: null
		};
	},
	/**
	 * Map a project draft (ProjectDraftAction) into the confirmed R4 apply. All
	 * project-shaped knowledge stays here; the orchestrator only stages + runs it
	 * behind confirmation. Returns null when there's nothing to apply.
	 */
	buildApplyRequest({ draft, context }: BuildApplyRequestArgs): ApplyRequest | null {
		const projectId = context.routeContext?.projectId;
		const changes = (draft as { changes?: unknown[] } | null)?.changes;
		if (!projectId || !Array.isArray(changes) || changes.length === 0) return null;
		return {
			capabilityId: 'project.apply-task-change-set',
			input: { projectId, changes },
			summary: `${changes.length} change(s) to project ${projectId}`
		};
	}
};
