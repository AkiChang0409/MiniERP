import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import { createProjectApi } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * GET /api/projects/[id]/critical-path → { taskIds, durationDays }
 *
 * v1 implements the longest-path-by-duration heuristic over the task DAG.
 * Returns an empty list if the project has no tasks or no dependencies.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const result = await project.getCriticalPath(event.params.id);
		return ok(result);
	} catch (e) {
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
