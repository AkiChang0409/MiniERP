import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { financeCapabilities } from '../../capabilities';
import { matchSupplierCapability } from '../../capabilities/match-supplier';
import {
	clearCapabilityRegistry,
	listToolSpecs,
	registerCapability,
	type ToolManifest
} from '$platform/ai/capability-registry';

/**
 * Guards the v5 "SDK-for-agent" contract on the finance reference module:
 *  1. every finance capability carries a runtime Zod `inputSchema`
 *  2. the platform registry serializes that schema into an LLM tool spec
 */
describe('finance capability contract', () => {
	it('every capability exposes a serializable Zod inputSchema', () => {
		expect(financeCapabilities.length).toBeGreaterThan(0);
		for (const capability of financeCapabilities) {
			expect(capability.inputSchema, `${capability.id} missing inputSchema`).toBeDefined();
			// must serialize to JSON Schema without throwing (what the agent tool list needs)
			const jsonSchema = z.toJSONSchema(capability.inputSchema);
			expect(jsonSchema, `${capability.id} produced no JSON schema`).toBeTypeOf('object');
		}
	});
});

describe('capability registry → tool specs', () => {
	beforeEach(() => clearCapabilityRegistry());

	const manifest: ToolManifest = {
		id: matchSupplierCapability.id,
		ownerModule: 'finance',
		description: matchSupplierCapability.description,
		riskLevel: 'R1',
		allowedAgents: ['finance-agent'],
		requiredUserPermissions: ['finance:view'],
		requiresConfirmation: false,
		auditRequired: true,
		enabled: true
	};

	it('serializes a registered capability into a tool spec with JSON-Schema parameters', () => {
		registerCapability(manifest, matchSupplierCapability);

		const specs = listToolSpecs();
		const spec = specs.find((s) => s.id === matchSupplierCapability.id);

		expect(spec).toBeDefined();
		expect(spec?.parameters).toBeTypeOf('object');
		expect(spec?.parameters).not.toBeNull();
		expect(spec?.ownerModule).toBe('finance');
	});

	it('scopes the catalog by agentId', () => {
		registerCapability(manifest, matchSupplierCapability);

		expect(listToolSpecs({ agentId: 'finance-agent' })).toHaveLength(1);
		expect(listToolSpecs({ agentId: 'some-other-agent' })).toHaveLength(0);
	});
});
