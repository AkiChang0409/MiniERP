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
 * PATCH  /api/projects/[id]/tasks/[taskId]   — drag/resize, reassign, etc.
 * DELETE /api/projects/[id]/tasks/[taskId]   — soft-delete
 */
export const PATCH: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const svc = new ProjectTaskService(ctx);
		const body = (await event.request.json()) as Record<string, unknown>;
		const allowed = [
			'name',
			'description',
			'startDate',
			'endDate',
			'assigneeId',
			'estimatedHours',
			'parentTaskId',
			'orderIndex',
			'isMilestone',
			'workflowStageId',
			'status',
			'completedAt',
			// Gantt optimization P0
			'kind',
			'progressPct',
			'bufferDays',
			'blockedReason',
			'outsourcedPartnerId',
			'subProjectId',
			'baselineStart',
			'baselineEnd',
			'actualStart',
			'rescheduleReason'
		];
		const patch: Record<string, unknown> = {};
		for (const k of allowed) {
			if (Object.prototype.hasOwnProperty.call(body, k)) patch[k] = body[k];
		}
		const result = await svc.update(event.params.taskId, event.params.id, patch);
		return ok(result);
	} catch (e) {
		if (e instanceof ProjectValidationError) {
			return fail(e.message + ': ' + Object.values(e.fields).join('; '), 400);
		}
		if (e instanceof ProjectPermissionError) return fail(e.message, 403);
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};

export const DELETE: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const svc = new ProjectTaskService(ctx);
		const result = await svc.remove(event.params.taskId, event.params.id);
		return ok(result);
	} catch (e) {
		if (e instanceof ProjectPermissionError) return fail(e.message, 403);
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
