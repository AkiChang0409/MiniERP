import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import {
	createProjectApi,
	ProjectPermissionError,
	ProjectValidationError
} from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * POST /api/projects/[id]/tasks/dependencies   body: { fromTaskId, toTaskId, kind?, lagDays? }
 */
export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const body = (await event.request.json()) as {
			fromTaskId?: string;
			toTaskId?: string;
			kind?: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish';
			lagDays?: number;
		};
		if (!body.fromTaskId || !body.toTaskId) {
			return fail('fromTaskId and toTaskId are required.', 400);
		}
		const result = await project.addTaskDependency({
			projectId: event.params.id,
			fromTaskId: body.fromTaskId,
			toTaskId: body.toTaskId,
			kind: body.kind,
			lagDays: body.lagDays
		});
		return ok(result, 201);
	} catch (e) {
		if (e instanceof ProjectValidationError) {
			return fail(e.message + ': ' + Object.values(e.fields).join('; '), 400);
		}
		if (e instanceof ProjectPermissionError) return fail(e.message, 403);
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
