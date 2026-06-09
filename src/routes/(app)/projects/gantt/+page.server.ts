import type { PageServerLoad } from './$types';

import { createModuleContext } from '$platform/modules';
import { ProjectTaskService } from '$modules/project';

function defaultRange(): { from: string; to: string } {
	const today = new Date();
	const start = new Date(today);
	start.setDate(start.getDate() - 30);
	const end = new Date(today);
	end.setDate(end.getDate() + 120);
	return {
		from: start.toISOString().slice(0, 10),
		to: end.toISOString().slice(0, 10)
	};
}

export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		const range = defaultRange();
		return { projects: [], filters: { scope: 'all', ...range } };
	}

	const ctx = await createModuleContext(event);
	const svc = new ProjectTaskService(ctx);

	const range = defaultRange();
	const scope = event.url.searchParams.get('scope') === 'mine' ? 'mine' : 'all';
	const from = event.url.searchParams.get('from') ?? range.from;
	const to = event.url.searchParams.get('to') ?? range.to;

	const { projects } = await svc.portfolio({ scope, fromIso: from, toIso: to });

	return {
		projects,
		filters: { scope, from, to }
	};
};
