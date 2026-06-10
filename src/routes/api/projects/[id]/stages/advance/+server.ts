import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import {
	ProjectTaskService,
	ProjectPermissionError
} from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * POST /api/projects/[id]/stages/advance
 *
 * Triggers the auto-advance check. Called on demand by the UI after a task
 * completes, or by a cron sweep that polls all active projects.
 */
export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const svc = new ProjectTaskService(ctx);
		const result = await svc.autoAdvanceStages(event.params.id);
		return ok(result);
	} catch (e) {
		if (e instanceof ProjectPermissionError) return fail(e.message, 403);
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
