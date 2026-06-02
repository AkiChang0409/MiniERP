import type { PageServerLoad } from './$types';

import { createModuleContext } from '$platform/modules';
import { createProjectApi } from '$modules/project';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		return {
			dashboard: {
				generatedAt: new Date().toISOString(),
				statusSummary: [],
				upcoming: [],
				overdue: [],
				lookahead: { from: '', to: '' }
			}
		};
	}
	const ctx = await createModuleContext(event);
	const project = createProjectApi(ctx);
	const dashboard = await project.getDashboard();
	return { dashboard };
};
