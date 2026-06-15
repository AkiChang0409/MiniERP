import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import { ProjectTaskService } from '$modules/project';
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
		const svc = new ProjectTaskService(ctx);
		const data = await svc.schedule(event.params.id);
		return ok(data);
	} catch (e) {
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
