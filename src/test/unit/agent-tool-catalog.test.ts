import { describe, it, expect, beforeEach } from 'vitest';
import {
	clearCapabilityRegistry,
	registerCapability,
	type PlatformCapability,
	type ToolManifest
} from '$platform/ai/capability-registry';
import { buildAgentToolCatalog } from '$platform/ai/orchestrator/tool-catalog';

/**
 * The unified loop's catalog is scoped by the user's roles × each tool's
 * `requiredUserPermissions` (via tool-policy's PERMISSION_TO_ROLES). Reads and
 * writes are both included; tools with no required permissions are available to
 * everyone.
 */
function cap(id: string): PlatformCapability<unknown, unknown> {
	return { id, description: id, riskLevel: 'R1', execute: async () => ({}) };
}

function manifest(id: string, perms: string[], sideEffect: 'read' | 'write'): ToolManifest {
	return {
		id,
		ownerModule: 'test',
		description: id,
		riskLevel: 'R1',
		allowedAgents: ['test-agent'],
		requiredUserPermissions: perms,
		requiresConfirmation: sideEffect === 'write',
		auditRequired: true,
		enabled: true,
		sideEffect
	};
}

describe('buildAgentToolCatalog — role-scoped cross-domain catalog', () => {
	beforeEach(() => {
		clearCapabilityRegistry();
		registerCapability(manifest('finance.read', ['finance:view'], 'read'), cap('finance.read'));
		registerCapability(manifest('project.edit', ['project:edit'], 'write'), cap('project.edit'));
		registerCapability(manifest('open.tool', [], 'read'), cap('open.tool'));
	});

	it('includes only tools whose required permissions the roles satisfy', () => {
		const ids = buildAgentToolCatalog(['finance']).map((t) => t.id);
		expect(ids).toContain('finance.read');
		expect(ids).toContain('open.tool'); // no perms required → always available
		expect(ids).not.toContain('project.edit'); // finance role lacks project:edit
	});

	it('includes write tools (flagged) when the role grants them', () => {
		const catalog = buildAgentToolCatalog(['project_manager']);
		const write = catalog.find((t) => t.id === 'project.edit');
		expect(write).toBeDefined();
		expect(write?.sideEffect).toBe('write');
		expect(write?.requiresConfirmation).toBe(true);
	});

	it('grants only permission-free tools to a user with no roles', () => {
		expect(buildAgentToolCatalog(null).map((t) => t.id)).toEqual(['open.tool']);
		expect(buildAgentToolCatalog([]).map((t) => t.id)).toEqual(['open.tool']);
	});
});
