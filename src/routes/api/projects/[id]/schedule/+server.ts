import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import { createProjectApi } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * GET /api/projects/[id]/schedule
 *
 * CPM schedule (Gantt P2): per-task total/free slack + critical path +
 * conflicts (dependency violations + resource over-allocation). Read-only —
 * never mutates the user's manual dates.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const data = await project.getTaskSchedule(event.params.id);
		return ok(data);
	} catch (e) {
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
