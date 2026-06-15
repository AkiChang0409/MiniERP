import type { PageServerLoad } from './$types';

import { createModuleContext } from '$platform/modules';
import { ProjectTaskService, createProjectApi } from '$modules/project';

/**
 * Project-internal Gantt (P1). Loads the task roster + dependency graph +
 * workflow stages (swimlanes) + the computed critical path, plus the user
 * directory for the assignee picker. All writes happen client-side against the
 * existing task/dependency/stage REST endpoints.
 */
export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		return {
			projectId: event.params.id,
			project: null as any,
			tasks: [],
			dependencies: [],
			stages: [],
			criticalPath: [] as string[],
			conflicts: [] as any[],
			scheduleById: {} as Record<string, any>,
			projectDurationDays: 0,
			users: [] as Array<{ id: string; name: string | null; email: string }>,
			subProjects: [] as Array<{ id: string; name: string }>,
			dataMessage: 'Cloudflare platform bindings are required.'
		};
	}

	const ctx = await createModuleContext(event);
	const svc = new ProjectTaskService(ctx);
	const api = createProjectApi(ctx);
	const projectId = event.params.id;

	try {
		const [project, roster, sched, stages, users, subProjects] = await Promise.all([
			api.getById(projectId),
			svc.list(projectId),
			svc.schedule(projectId),
			svc.listStages(projectId),
			api.listUsers(),
			api.getSubProjects(projectId)
		]);
		const scheduleById = Object.fromEntries(
			sched.tasks.map((t) => [t.id, t.schedule])
		);
		return {
			projectId,
			project,
			tasks: roster.tasks,
			dependencies: roster.dependencies,
			stages,
			criticalPath: sched.criticalPath,
			conflicts: sched.conflicts,
			scheduleById,
			projectDurationDays: sched.projectDurationDays,
			users,
			subProjects: subProjects.map((p) => ({ id: p.id, name: p.name })),
			dataMessage: null as string | null
		};
	} catch (err) {
		const msg = (err as Error)?.message ?? '';
		if (/no such table|project_tasks/i.test(msg)) {
			return {
				projectId,
				project: null as any,
				tasks: [],
				dependencies: [],
				stages: [],
				criticalPath: [] as string[],
				conflicts: [] as any[],
				scheduleById: {} as Record<string, any>,
				projectDurationDays: 0,
				users: [] as Array<{ id: string; name: string | null; email: string }>,
				subProjects: [] as Array<{ id: string; name: string }>,
				dataMessage:
					'Database is missing the project_tasks table. Run `npm run db:migrate:local`.'
			};
		}
		throw err;
	}
};
