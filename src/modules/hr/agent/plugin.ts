/**
 * HR domain-agent plugin — generic projection for the unified orchestrator.
 * Wraps the existing manifest + rule-based intent classifier + policy. The HR
 * manifest is intentionally narrow (leave list / submit / approve); `owns` and a
 * default risk are supplied here since the typed manifest omits them.
 */
import type {
	AgentIntentResult,
	DomainAgentPlugin,
	IntentClassificationInput
} from '$platform/ai/orchestrator';
import type { PlatformRiskLevel } from '$platform/ai/capability-registry';
import { hrAgentManifest } from './manifest';
import { classifyHrIntent } from './intent-classifier';
import { hrAgentAllowedCapabilities, findHrCapabilityPolicy } from './policy';

export const hrAgentPlugin: DomainAgentPlugin = {
	manifest: {
		id: hrAgentManifest.id,
		name: hrAgentManifest.name,
		domain: hrAgentManifest.domain,
		version: hrAgentManifest.version,
		description: hrAgentManifest.description,
		owns: ['leave_request'],
		canHandle: hrAgentManifest.canHandle,
		cannotHandle: hrAgentManifest.cannotHandle,
		defaultRiskLevel: 'R1',
		forbiddenActions: hrAgentManifest.forbiddenActions
	},
	allowedCapabilityIds: hrAgentAllowedCapabilities.map((entry) => entry.id),
	classifyIntent(input: IntentClassificationInput): AgentIntentResult | null {
		if (!input.message) return null;
		const result = classifyHrIntent(input.message);
		if (result.intent === 'unknown' || result.capabilityId === null) return null;
		const riskLevel: PlatformRiskLevel =
			findHrCapabilityPolicy(result.capabilityId)?.riskLevel ?? 'R1';
		return {
			agentId: hrAgentManifest.id,
			domain: hrAgentManifest.domain,
			intent: result.intent,
			confidence: 0.8,
			reason: 'keyword_match',
			riskLevel,
			requiredInputs: [],
			suggestedCapabilityId: result.capabilityId,
			suggestedWorkflowId: null
		};
	}
};
