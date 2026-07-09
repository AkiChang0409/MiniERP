/**
 * Sales-CRM domain-agent plugin (Step 3 — read-only). Routes customer/sales
 * questions to `sales-crm-agent`; the orchestrator's read-only tool loop exposes
 * `sales-crm.answer-question`.
 */
import type {
	AgentIntentResult,
	DomainAgentPlugin,
	IntentClassificationInput
} from '$platform/ai/orchestrator';

const SALES_HINT =
	/customers?|客户|clients?|\bsales\b|销售|\bcrm\b|quotations?|报价|orders?|订单|accounts?/i;

export const salesCrmAgentPlugin: DomainAgentPlugin = {
	manifest: {
		id: 'sales-crm-agent',
		name: 'Sales CRM Agent',
		domain: 'sales-crm',
		version: '0.1.0',
		description: 'Answer questions about customers and sales. Read-only / suggestive.',
		owns: ['customer', 'quotation', 'sales_order'],
		canHandle: ['answer_sales_question'],
		cannotHandle: ['create_customer', 'delete_customer', 'create_order'],
		defaultRiskLevel: 'R1',
		forbiddenActions: ['delete_customer', 'bypass_validation']
	},
	allowedCapabilityIds: ['sales-crm.answer-question'],
	answerCapabilityId: 'sales-crm.answer-question',
	classifyIntent(input: IntentClassificationInput): AgentIntentResult | null {
		if (!input.message || !SALES_HINT.test(input.message)) return null;
		return {
			agentId: 'sales-crm-agent',
			domain: 'sales-crm',
			intent: 'answer_sales_question',
			confidence: 0.72,
			reason: 'keyword_hint',
			riskLevel: 'R1',
			requiredInputs: [],
			suggestedCapabilityId: 'sales-crm.answer-question',
			suggestedWorkflowId: null
		};
	}
};
