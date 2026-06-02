import type { ModuleDefinition } from '$platform/modules/types';
import { toLegacyModuleManifest } from '../../platform/registry/contracts';
import { projectAppSurface } from './app';
import { projectActions, projectCapabilities, projectCapabilityIds } from './capabilities';
import { projectManifestV2 } from './config';
import * as projectContracts from './contracts';
import * as projectEvents from './events';
import * as projectPolicies from './policies';
import * as projectRepositories from './repositories';
import * as projectRules from './rules';
import * as projectServices from './services';
import { projectWorkflows, projectWorkflowIds } from './workflows';

export const projectModule: ModuleDefinition = {
	manifest: toLegacyModuleManifest(projectManifestV2),
	manifestV2: projectManifestV2,
	registerHandlers: projectEvents.registerProjectHandlers
};

export { createProjectApi, createProjectPublicApi, type ProjectApi } from './services';
export {
	ProjectPermissionError,
	ProjectValidationError,
	computeNextDeadline,
	type ProjectCreateInput,
	type ProjectUpdateInput
} from './services/legacy-project-service';
export { projectActions };
export type { ProjectSource } from './contracts';
export type { ProjectInboundContract, ProjectPublicGroup } from './contracts/inbound';
export { PROJECT_PUBLIC_GROUPS } from './contracts/inbound';
export { projectAppSurface };
export { projectCapabilities, projectCapabilityIds };
export { projectWorkflows, projectWorkflowIds };
export { projectManifestV2 };
export {
	projectContracts,
	projectServices,
	projectRules,
	projectRepositories,
	projectPolicies,
	projectEvents
};

export const projectPublicSurface = {
	manifest: projectManifestV2,
	contracts: projectContracts,
	capabilities: projectCapabilities,
	workflows: projectWorkflows,
	services: projectServices,
	app: projectAppSurface
};
