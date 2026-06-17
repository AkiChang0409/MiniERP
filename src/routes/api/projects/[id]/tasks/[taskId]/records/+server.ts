import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import { ProjectQmsService, ProjectPermissionError, ProjectValidationError } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * GET  /api/projects/[id]/tasks/[taskId]/records → { records }
 * POST /api/projects/[id]/tasks/[taskId]/records  body: { templateIds: string[] }
 *      — attach one or more suggested QMS templates as records on the task.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const svc = new ProjectQmsService(ctx);
		const records = await svc.listRecordsForTask(event.params.id, event.params.taskId);
		return ok({ records });
	} catch (e) {
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const svc = new ProjectQmsService(ctx);
		const body = (await event.request.json()) as { templateIds?: unknown };
		const templateIds = Array.isArray(body.templateIds)
			? body.templateIds.map((t) => String(t))
			: [];
		if (templateIds.length === 0) return fail('templateIds is required.', 400);
		const result = await svc.attachRecordsToTask(
			event.params.id,
			event.params.taskId,
			templateIds
		);
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
