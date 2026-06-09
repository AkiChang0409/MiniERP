import type { PageServerLoad } from './$types';

import { createModuleContext } from '$platform/modules';
import {
	ProjectTaskService,
	computeUrgency,
	type UrgencyResult
} from '$modules/project';

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

	// "Tasks scheduled past deadline" popup (Motion-style). We classify the
	// portfolio projects into two buckets:
	//
	//   HARD deadline — overdue (deadline < today, not completed)
	//   SOFT deadline — urgent tier (<20% of the time window remaining)
	//
	// Both buckets exclude `completed` and `archived`. The popup only shows
	// if there's something in either list.
	type AlertItem = {
		id: string;
		name: string;
		deadline: string | null;
		owner: string;
		daysUntil: number | null;
		urgency: UrgencyResult;
	};
	const alertsHard: AlertItem[] = [];
	const alertsSoft: AlertItem[] = [];
	const now = new Date();
	for (const p of projects) {
		if (p.status === 'completed' || p.status === 'archived') continue;
		const urg = computeUrgency({
			status: p.status,
			startDate: p.startDate,
			deadline: p.deadline,
			createdAt: p.createdAt,
			now
		});
		const item: AlertItem = {
			id: p.id,
			name: p.name,
			deadline: p.deadline ?? null,
			owner: p.ownerName ?? p.ownerEmail ?? '— unassigned —',
			daysUntil: urg.daysUntilDeadline,
			urgency: urg
		};
		if (urg.level === 'overdue') alertsHard.push(item);
		else if (urg.level === 'urgent') alertsSoft.push(item);
	}
	alertsHard.sort(
		(a, b) => (a.daysUntil ?? -Infinity) - (b.daysUntil ?? -Infinity)
	);
	alertsSoft.sort(
		(a, b) => (a.daysUntil ?? Infinity) - (b.daysUntil ?? Infinity)
	);

	return {
		projects,
		filters: { scope, from, to },
		dataMessage,
		alerts: {
			hard: alertsHard,
			soft: alertsSoft
		}
	};
};
