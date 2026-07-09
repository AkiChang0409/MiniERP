import { describe, it, expect } from 'vitest';
import { inventoryAgentPlugin } from '$modules/inventory/agent';
import { salesCrmAgentPlugin } from '$modules/sales-crm/agent';

/**
 * Locks the keyword routing for the Step-3 read-only domain agents: a domain-ish
 * message resolves to that agent's answer-question capability; an unrelated one
 * returns null so the router can pick another agent.
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

	it('routes customer/sales questions to sales-crm.answer-question', () => {
		for (const msg of ['list our customers', '这个客户的订单', 'any quotation for Acme']) {
			const r = salesCrmAgentPlugin.classifyIntent({ message: msg });
			expect(r, msg).not.toBeNull();
			expect(r?.suggestedCapabilityId).toBe('sales-crm.answer-question');
		}
	});

	it('returns null for out-of-domain messages', () => {
		expect(inventoryAgentPlugin.classifyIntent({ message: 'submit my annual leave' })).toBeNull();
		expect(salesCrmAgentPlugin.classifyIntent({ message: 'reschedule the QC task' })).toBeNull();
	});
});
