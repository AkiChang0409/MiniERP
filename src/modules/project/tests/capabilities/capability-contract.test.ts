import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { projectCapabilities } from '../../capabilities';
import { generatePlanCapability } from '../../capabilities/generate-plan';
import { projectAgentAllowedCapabilities, PROJECT_AGENT_ID } from '../../agent';
import {
	clearCapabilityRegistry,
	listToolSpecs,
	registerCapability,
	type ToolManifest
} from '$platform/ai/capability-registry';

/**
 * Guards the v5 "SDK-for-agent" contract on the project module:
 *  1. every project capability carries a runtime Zod input + output schema
 *  2. every capability has a matching agent policy entry (the registration
 *     bootstrap throws otherwise)
 *  3. the platform registry serializes the input schema into an LLM tool spec
 */
describe('project capability contract', () => {
	it('every capability exposes serializable Zod input + output schemas', () => {
		expect(projectCapabilities.length).toBe(6);
		for (const capability of projectCapabilities) {
			expect(capability.inputSchema, `${capability.id} missing inputSchema`).toBeDefined();
			expect(capability.outputSchema, `${capability.id} missing outputSchema`).toBeDefined();
			const jsonSchema = z.toJSONSchema(capability.inputSchema);
			expect(jsonSchema, `${capability.id} produced no JSON schema`).toBeTypeOf('object');
		}
	});

	it('every capability has a matching agent policy entry', () => {
		for (const capability of projectCapabilities) {
			const policy = projectAgentAllowedCapabilities.find((entry) => entry.id === capability.id);
			expect(policy, `${capability.id} has no policy entry`).toBeDefined();
			// All project capabilities are read-only / suggestive.
			expect(policy?.sideEffect).toBe('read');
			expect(policy?.requiresConfirmation).toBe(false);
		}
	});
});

describe('project capability registry → tool specs', () => {
	beforeEach(() => clearCapabilityRegistry());

	const manifest: ToolManifest = {
		id: generatePlanCapability.id,
		ownerModule: 'project',
		description: generatePlanCapability.description,
		riskLevel: 'R1',
		allowedAgents: [PROJECT_AGENT_ID],
		requiredUserPermissions: ['project:edit'],
		requiresConfirmation: false,
		auditRequired: true,
		enabled: true,
		sideEffect: 'read',
		inputSchema: generatePlanCapability.inputSchema,
		outputSchema: generatePlanCapability.outputSchema
	};

	it('serializes a registered capability into a tool spec with JSON-Schema parameters', () => {
		registerCapability(manifest, generatePlanCapability);

		const spec = listToolSpecs().find((s) => s.id === generatePlanCapability.id);

		expect(spec).toBeDefined();
		expect(spec?.parameters).toBeTypeOf('object');
		expect(spec?.parameters).not.toBeNull();
		expect(spec?.ownerModule).toBe('project');
	});

	it('scopes the catalog by agentId', () => {
		registerCapability(manifest, generatePlanCapability);

		expect(listToolSpecs({ agentId: PROJECT_AGENT_ID })).toHaveLength(1);
		expect(listToolSpecs({ agentId: 'some-other-agent' })).toHaveLength(0);
	});
});
