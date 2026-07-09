/**
 * Inventory domain-agent plugin (Step 3 — read-only). Routes inventory-ish
 * messages to `inventory-agent`; the orchestrator's read-only tool loop then
 * exposes `inventory.answer-question`. No planAction / no writes yet.
 */
import type {
	AgentIntentResult,
	DomainAgentPlugin,
	IntentClassificationInput
} from '$platform/ai/orchestrator';

const INVENTORY_HINT =
	/inventory|stock|库存|存货|items?|物料|warehouses?|仓库|aging|库龄|low\s*stock|缺货|reorder|补货/i;

export const inventoryAgentPlugin: DomainAgentPlugin = {
	manifest: {
		id: 'inventory-agent',
		name: 'Inventory Agent',
		domain: 'inventory',
		version: '0.1.0',
		description:
			'Answer questions about inventory items, stock levels, and aging. Read-only / suggestive.',
		owns: ['item', 'stock_level', 'warehouse', 'inventory_movement'],
		canHandle: ['answer_inventory_question'],
		cannotHandle: ['adjust_stock', 'create_item', 'transfer_stock'],
		defaultRiskLevel: 'R1',
		forbiddenActions: ['adjust_stock', 'delete_item', 'bypass_validation']
	},
	allowedCapabilityIds: ['inventory.answer-question'],
	answerCapabilityId: 'inventory.answer-question',
	classifyIntent(input: IntentClassificationInput): AgentIntentResult | null {
		if (!input.message || !INVENTORY_HINT.test(input.message)) return null;
		return {
			agentId: 'inventory-agent',
			domain: 'inventory',
			intent: 'answer_inventory_question',
			confidence: 0.75,
			reason: 'keyword_hint',
			riskLevel: 'R1',
			requiredInputs: [],
			suggestedCapabilityId: 'inventory.answer-question',
			suggestedWorkflowId: null
		};
	}
};
