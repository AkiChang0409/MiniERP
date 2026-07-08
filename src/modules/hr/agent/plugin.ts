/**
 * HR domain-agent plugin — generic projection for the unified orchestrator.
 * Routing uses the rule-based classifier (broadened with a leave-keyword hint so
 * domain detection is robust); the real intent + input extraction + result
 * rendering live in `plan-action.ts` (`planAction`/`renderResult`), which the
 * orchestrator drives after routing. `owns` and a default risk are supplied here
 * since the typed manifest omits them.
 */
import type {
	AgentIntentResult,
	DomainAgentPlugin,
	IntentClassificationInput
} from '$platform/ai/orchestrator';
import type { PlatformRiskLevel } from '$platform/ai/capability-registry';
import { hrAgentManifest } from './manifest';
import { classifyHrIntent } from './intent-classifier';
import { planHrAction, renderHrResult } from './plan-action';
import { hrAgentAllowedCapabilities, findHrCapabilityPolicy } from './policy';

/** Leave phrasings the rule classifier can miss — enough to route to hr-agent;
 *  `planAction` then does the precise LLM intent + extraction. */
const HR_HINT =
	/请假|休假|销假|年假|病假|事假|调休|待审批|批准.*假|\bleave\b|annual leave|sick leave|\bmc\b/i;

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
		if (result.intent !== 'unknown' && result.capabilityId) {
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
		// Broaden: catch leave phrasings the rule classifier misses so the router
		// still picks hr-agent; planAction refines the actual intent + input.
		if (HR_HINT.test(input.message)) {
			return {
				agentId: hrAgentManifest.id,
				domain: hrAgentManifest.domain,
				intent: 'submit_leave',
				confidence: 0.7,
				reason: 'hr_keyword_hint',
				riskLevel: 'R4',
				requiredInputs: [],
				suggestedCapabilityId: 'hr.submit-leave-request',
				suggestedWorkflowId: null
			};
		}
		return null;
	},
	planAction: planHrAction,
	renderResult: renderHrResult
};
