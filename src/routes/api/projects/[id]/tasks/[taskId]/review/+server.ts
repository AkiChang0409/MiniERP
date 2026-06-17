import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import { ProjectQmsService, ProjectPermissionError, ProjectValidationError } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * POST /api/projects/[id]/tasks/[taskId]/review
 *   body: { decision: 'approve' | 'reject', reason?: string }
 *
 * Manager/owner action from the review workspace. Approve completes the task
 * (approving its submitted ISO records first); reject sends it back to the
 * assignee (→ ongoing) with a reason.
 */
export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const svc = new ProjectQmsService(ctx);
		const body = (await event.request.json().catch(() => ({}))) as {
			decision?: unknown;
			reason?: unknown;
		};
		const decision = String(body.decision ?? '');
		const reason = body.reason == null ? null : String(body.reason);
		let result;
		if (decision === 'approve') {
			result = await svc.approveTask(event.params.id, event.params.taskId);
		} else if (decision === 'reject') {
			result = await svc.rejectTask(event.params.id, event.params.taskId, reason);
		} else {
			return fail(`Unknown decision "${decision}".`, 400);
		}
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
