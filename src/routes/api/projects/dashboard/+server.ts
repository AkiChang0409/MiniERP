import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { createProjectApi } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * TKMGMT10 — Project Dashboard:
 *   - status summary counts (pie/bar)
 *   - top 5 upcoming deadlines (within 7 days)
 *   - overdue tasks
 *
 * Auto-refresh is the client's job (it polls or revalidates on focus). This
 * endpoint always returns fresh numbers — no caching.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const dashboard = await project.getDashboard();
		return ok(dashboard);
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
