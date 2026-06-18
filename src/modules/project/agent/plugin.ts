/**
 * Project domain-agent plugin — generic projection for the unified orchestrator.
 * Wraps the existing manifest + intent classifier + policy. Project capabilities
 * are all read-only / suggestive (R0–R1); writes stay on the deterministic
 * `createProjectApi` path until governed write capabilities land (plan Phase 8).
 */
import type {
	AgentIntentResult,
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
	}
};
