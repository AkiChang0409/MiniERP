import { describe, it, expect } from 'vitest';
import { inventoryAgentPlugin } from '$modules/inventory/agent';
import { salesCrmAgentPlugin } from '$modules/sales-crm/agent';

/**
 * Inventory still uses its legacy keyword classifier. Sales CRM intentionally
 * does not: customer questions should be routed by the orchestrator LLM router
 * and then answered through explicit CRM read tools.
 */
describe('domain agent routing (inventory / sales-crm)', () => {
	it('routes inventory questions to inventory.answer-question', () => {
		for (const msg of ['how much stock of widget A', '仓库还有多少库存', 'which items are low stock']) {
			const r = inventoryAgentPlugin.classifyIntent({ message: msg });
			expect(r, msg).not.toBeNull();
			expect(r?.suggestedCapabilityId).toBe('inventory.answer-question');
			expect(r?.riskLevel).toBe('R1');
		}
	});

	it('does not keyword-route customer/sales questions', () => {
		for (const msg of ['list our customers', '这个客户的订单', 'any quotation for Acme']) {
			const r = salesCrmAgentPlugin.classifyIntent({ message: msg });
			expect(r, msg).toBeNull();
		}
	});

	it('returns null for out-of-domain messages', () => {
		expect(inventoryAgentPlugin.classifyIntent({ message: 'submit my annual leave' })).toBeNull();
		expect(salesCrmAgentPlugin.classifyIntent({ message: 'reschedule the QC task' })).toBeNull();
	});
});
