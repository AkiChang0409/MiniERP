import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { fail, ok } from '$platform/http';
import { ProjectAutoAssignService } from '$modules/project';

/**
 * POST /api/projects/[id]/tasks/auto-assign
 *   body: { startDate?, endDate?, estimatedHours?, taskId? }
 *
 * Returns the recommended assignee + a rationale string. The caller can
 * then PATCH /api/projects/[id]/tasks/[taskId] with the assigneeId, or
 * pre-fill the create form. Doesn't mutate state.
 */
export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const svc = new ProjectAutoAssignService(ctx);
		const body = (await event.request.json()) as {
			startDate?: string | null;
			endDate?: string | null;
			estimatedHours?: number | null;
		};
		const result = await svc.pickAssignee({
			projectId: event.params.id,
			startDate: body.startDate ?? null,
			endDate: body.endDate ?? null,
			estimatedHours: body.estimatedHours ?? null
		});
		return ok(result);
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
