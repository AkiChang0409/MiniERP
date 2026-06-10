import type { ModuleManifestV2 } from '$platform/registry/contracts';
import type { ModuleDefinition } from '$platform/modules/types';
import { toLegacyModuleManifest } from '$platform/registry/contracts';
import { financeDashboardCards, financeNavigationEntries, financeWorkspaceEntries } from './app';
import { financeCapabilityIds } from './capabilities';
import { financeEventContracts } from './domain/events';
import { financeInboundContracts } from './contracts/inbound';
import { registerFinanceHandlers } from './events';
import { financeOutboundContracts } from './integrations/contracts';
import { financeWorkflowIds } from './workflows';

/**
 * Finance module registration: manifest assembly (dependencies, routes,
 * permissions, contract surfaces) + the `ModuleDefinition` consumed by
 * `register-modules.ts`. This is the module's wiring root.
 */
export const financeManifestV2: ModuleManifestV2 = {
	id: 'finance',
	name: 'Finance',
	layer: 'base',
	deliveryModes: ['standalone', 'suite'],
	dependencies: [
		{
			moduleId: 'core',
			strength: 'strong',
			description: 'Finance requires core platform capabilities',
			failurePolicy: 'block'
		},
		{
			moduleId: 'project',
			strength: 'weak',
			description: 'Finance enriches records with project lookups',
			failurePolicy: 'degrade'
		},
		{
			moduleId: 'hr',
			strength: 'weak',
			description: 'Finance enriches records with employee and person lookups',
			failurePolicy: 'degrade'
		}
	],
	routes: [...financeNavigationEntries],
	workspaces: financeWorkspaceEntries.map((entry) => entry.id),
	permissions: ['finance:view', 'finance:edit', 'finance:tax'],
	taskTypes: ['finance-task'],
	workflows: [...financeWorkflowIds],
	dashboardCards: [...financeDashboardCards],
	aiCapabilities: [...financeCapabilityIds],
	contract: {
		inbound: financeInboundContracts,
		outbound: financeOutboundContracts,
		events: financeEventContracts
	}
};

export const financeModule: ModuleDefinition = {
	manifest: toLegacyModuleManifest(financeManifestV2),
	manifestV2: financeManifestV2,
	registerHandlers: registerFinanceHandlers
};
