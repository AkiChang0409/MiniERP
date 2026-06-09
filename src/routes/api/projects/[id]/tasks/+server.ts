import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import {
	ProjectTaskService,
	ProjectPermissionError,
	ProjectValidationError
} from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * GET  /api/projects/[id]/tasks   → { tasks, dependencies }
 * POST /api/projects/[id]/tasks   body: TaskCreateInput minus projectId
 */
export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const svc = new ProjectTaskService(ctx);
		const data = await svc.list(event.params.id);
		return ok(data);
	} catch (e) {
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const svc = new ProjectTaskService(ctx);
		const body = (await event.request.json()) as Record<string, unknown>;
		const result = await svc.create({
			projectId: event.params.id,
			name: String(body.name ?? ''),
			description: body.description == null ? undefined : String(body.description),
			startDate: body.startDate == null ? null : String(body.startDate),
			endDate: body.endDate == null ? null : String(body.endDate),
			assigneeId: body.assigneeId == null ? null : String(body.assigneeId),
			estimatedHours:
				typeof body.estimatedHours === 'number'
					? body.estimatedHours
					: body.estimatedHours == null
						? null
						: Number(body.estimatedHours),
			parentTaskId: body.parentTaskId == null ? null : String(body.parentTaskId),
			isMilestone: Boolean(body.isMilestone),
			workflowStageId: body.workflowStageId == null ? null : String(body.workflowStageId),
			status: (body.status as undefined) ?? undefined
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
