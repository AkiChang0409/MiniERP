import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import { ProjectTaskService } from '$modules/project';
import { fail, ok } from '$platform/http';

/** GET /api/projects/[id]/tasks/[taskId]/history — reschedule/delay log. */
export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const svc = new ProjectTaskService(ctx);
		const changes = await svc.listTaskHistory(event.params.id, event.params.taskId);
		return ok({ changes });
	} catch (e) {
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
