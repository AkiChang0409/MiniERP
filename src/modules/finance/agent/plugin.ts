/**
 * Finance domain-agent plugin — the module's public, generic projection for the
 * unified orchestrator. Wraps the existing manifest + intent classifier + policy
 * (does not rewrite them) into the platform `DomainAgentPlugin` contract.
 */
import type {
	AgentIntentResult,
	DomainAgentPlugin,
	IntentClassificationInput
} from '$platform/ai/orchestrator';
import { financeAgentManifest } from './manifest';
import { classifyFinanceIntent } from './intent-classifier';
import { financeAgentAllowedCapabilities } from './policy';

export const financeAgentPlugin: DomainAgentPlugin = {
	manifest: {
		id: financeAgentManifest.id,
		name: financeAgentManifest.name,
		domain: financeAgentManifest.domain,
		version: financeAgentManifest.version,
		description: financeAgentManifest.description,
		owns: financeAgentManifest.owns,
		canHandle: financeAgentManifest.canHandle,
		cannotHandle: financeAgentManifest.cannotHandle,
		defaultRiskLevel: financeAgentManifest.defaultRiskLevel,
		forbiddenActions: financeAgentManifest.forbiddenActions
	},
	allowedCapabilityIds: financeAgentAllowedCapabilities.map((entry) => entry.id),
	classifyIntent(input: IntentClassificationInput): AgentIntentResult | null {
		const result = classifyFinanceIntent({
			message: input.message,
			currentPath: input.currentPath
		});
		if (result.intent === 'unknown') return null;
		return {
			agentId: financeAgentManifest.id,
			domain: financeAgentManifest.domain,
			intent: result.intent,
			confidence: result.confidence,
			reason: result.reason,
			riskLevel: result.riskLevel,
			requiredInputs: result.requiredInputs,
			suggestedWorkflowId: result.suggestedWorkflow,
			suggestedCapabilityId: null,
			suggestedCategoryId: result.suggestedCategoryId ?? null
		};
	}
};
