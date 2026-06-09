import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import { ProjectTaskService, ProjectPermissionError } from '$modules/project';
import { fail, ok } from '$platform/http';

export const DELETE: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const svc = new ProjectTaskService(ctx);
		const result = await svc.removeDependency(event.params.depId, event.params.id);
		return ok(result);
	} catch (e) {
		if (e instanceof ProjectPermissionError) return fail(e.message, 403);
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
