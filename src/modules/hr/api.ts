import type { ModuleContext } from '$platform/modules/types';
import { createHrLegacySources } from './adapters';
import { createHrDirectoryApi } from './employee-api';
import { createLeaveApi } from './leave-api';
import { createHrPeopleApi } from './person-api';

export type HrApi = ReturnType<typeof createHrApi>;

export function createHrApi(ctx: ModuleContext) {
	const sources = createHrLegacySources(ctx);

	return {
		directory: createHrDirectoryApi(sources.directory),
		people: createHrPeopleApi(sources.people),
		leave: createLeaveApi(ctx)
	};
}
