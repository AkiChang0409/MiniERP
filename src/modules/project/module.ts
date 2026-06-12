import type { ModuleManifestV2 } from '$platform/registry/contracts';
import type { ModuleDefinition } from '$platform/modules/types';
import { toLegacyModuleManifest } from '$platform/registry/contracts';
import { projectDashboardCards, projectNavigationEntries, projectWorkspaceEntries } from './app';
import { projectCapabilityIds } from './capabilities';
import { projectEventContracts } from './domain/events';
import { projectInboundContracts, projectOutboundContracts } from './integrations/contracts';
import { registerProjectHandlers } from './events';
import { projectWorkflowIds } from './workflows';

/**
 * Project module registration: manifest assembly (dependencies, routes,
 * permissions, contract surfaces) + the `ModuleDefinition` consumed by
 * `register-modules.ts`. This is the module's wiring root. (Mirrors `finance/module.ts`.)
 */
export const projectManifestV2: ModuleManifestV2 = {
	id: 'project',
	name: 'Project',
	layer: 'base',
	deliveryModes: ['standalone', 'suite'],
	dependencies: [
		{
			moduleId: 'core',
			strength: 'strong',
			description: 'Project requires core platform capabilities',
			failurePolicy: 'block'
		},
		{
			moduleId: 'sales-crm',
			strength: 'strong',
			description: 'Project records need customer references',
			failurePolicy: 'block'
		}
	],
	routes: [...projectNavigationEntries],
	workspaces: projectWorkspaceEntries.map((entry) => entry.id),
	permissions: ['project:view', 'project:edit', 'project:staff'],
	taskTypes: [],
	workflows: [...projectWorkflowIds],
	dashboardCards: [...projectDashboardCards],
	aiCapabilities: [...projectCapabilityIds],
	contract: {
		inbound: projectInboundContracts,
		outbound: projectOutboundContracts,
		events: projectEventContracts
	}
};

export const projectModule: ModuleDefinition = {
	manifest: toLegacyModuleManifest(projectManifestV2),
	manifestV2: projectManifestV2,
	registerHandlers: registerProjectHandlers
};
