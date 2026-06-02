import type { ModuleManifestV2 } from '../../../platform/registry/contracts';
import { projectDashboardCards, projectNavigationEntries, projectWorkspaceEntries } from '../app';
import { projectCapabilityIds } from '../capabilities';
import { projectEventContracts } from '../contracts/events';
import { projectInboundContracts } from '../contracts/inbound';
import { projectOutboundContracts } from '../contracts/outbound';
import { projectWorkflowIds } from '../workflows';

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
