import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import {
	createProjectApi,
	ProjectPermissionError,
	ProjectValidationError
} from '$modules/project';
import { NotFoundError } from '$platform/modules/errors';
import { fail, ok } from '$platform/http';

/**
 * TKMGMT7 — flip a project to `status='completed'` and, if it is a recurring
 * series, auto-create the next occurrence. Returns `{ nextProjectId }`.
 */
export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const result = await project.completeAndMaybeRecur(event.params.id);
		return ok(result);
	} catch (e) {
		if (e instanceof ProjectValidationError) {
			return fail(e.message + ': ' + Object.values(e.fields).join('; '), 400);
		}
		if (e instanceof ProjectPermissionError) {
			return fail(e.message, 403);
		}
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
