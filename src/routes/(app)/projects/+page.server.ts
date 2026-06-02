import type { PageServerLoad } from './$types';

import { createModuleContext } from '$platform/modules';
import { createProjectApi } from '$modules/project';

const PAGE_SIZE = 10;

export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		return {
			projects: [],
			projectListCounts: { all: 0, active: 0 },
			filters: {
				q: '',
				status: '',
				startedAfter: '',
				scope: 'all' as 'all' | 'mine',
				page: 1
			},
			pagination: {
				page: 1,
				pageSize: PAGE_SIZE,
				total: 0,
				totalPages: 1,
				hasPrev: false,
				hasNext: false
			}
		};
	}

	const pageRaw = Number.parseInt(event.url.searchParams.get('page') ?? '1', 10);
	const scopeParam = event.url.searchParams.get('scope');
	const scope: 'all' | 'mine' = scopeParam === 'mine' ? 'mine' : 'all';
	const ctx = await createModuleContext(event);
	const project = createProjectApi(ctx);
	return project.getProjectListPage({
		q: event.url.searchParams.get('q'),
		status: event.url.searchParams.get('status'),
		startedAfter: event.url.searchParams.get('startedAfter'),
		scope,
		page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
	});
};
