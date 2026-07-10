/**
 * Sales-CRM domain-agent plugin. Routing is owned by the orchestrator's LLM
 * router; this plugin exposes governed CRM read tools once routed.
 */
import type {
	AgentIntentResult,
	DomainAgentPlugin,
	IntentClassificationInput
} from '$platform/ai/orchestrator';

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
	allowedCapabilityIds: [
		'sales-crm.list-business-partners',
		'sales-crm.search-business-partners',
		'sales-crm.get-business-partner'
	],
	classifyIntent(input: IntentClassificationInput): AgentIntentResult | null {
		void input;
		return null;
	}
};
