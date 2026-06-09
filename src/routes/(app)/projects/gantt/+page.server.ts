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

	// Portfolio query joins `project_tasks` — if migration 0010 hasn't run,
	// degrade to a project-only view rather than 500.
	let projects: Awaited<ReturnType<typeof svc.portfolio>>['projects'] = [];
	let dataMessage: string | null = null;
	try {
		const result = await svc.portfolio({ scope, fromIso: from, toIso: to });
		projects = result.projects;
	} catch (err) {
		const msg = (err as Error)?.message ?? '';
		if (/no such table|project_tasks/i.test(msg)) {
			dataMessage =
				'Database is missing the project_tasks table. Run `npm run db:migrate:local` to apply migration 0010.';
		} else {
			throw err;
		}
	}

	return {
		projects,
		filters: { scope, from, to },
		dataMessage
	};
};
