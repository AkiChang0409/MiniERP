import type { ModuleContext } from '$platform/modules/types';
import { createProjectLegacySource } from '../adapters/legacy';
import { createProjectPublicApi } from './project-service';

/**
 * `createProjectApi(ctx)` is the public entry point for the project module.
 *
 * Wave 1-3 used to re-implement a parallel `getProjectListPage` / `getById`
 * etc. on top of `legacy-project-service.ts`. Wave 4 (TKMGMT1-10) folded all
 * the new fields (owner, deadline, priority, attachments, recurrence,
 * collaborators, comments, dashboard, calendar) into `legacy-project-service`
 * — so this entry point now just delegates to it through the legacy adapter
 * and the `ProjectSource` contract, no override needed.
 */
export function createProjectApi(ctx: ModuleContext) {
	const legacySource = createProjectLegacySource(ctx);
	return createProjectPublicApi(legacySource);
}
