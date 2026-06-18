import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import { createProjectApi } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * GET /api/projects/[id]/tasks/[taskId]/records/suggestions
 *   → { taskType, templates: [{ ...template, attached }] }
 * Templates whose `taskType` matches the task, each flagged if already attached.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const data = await project.suggestQmsForTask(event.params.id, event.params.taskId);
		return ok(data);
	} catch (e) {
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
