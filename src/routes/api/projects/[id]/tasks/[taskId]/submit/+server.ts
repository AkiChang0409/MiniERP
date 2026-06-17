import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import { ProjectQmsService, ProjectPermissionError, ProjectValidationError } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * POST /api/projects/[id]/tasks/[taskId]/submit
 *   body: { note?: string, recordNotes?: Record<string,string> }
 *
 * The assignee's "I'm done" action from their personal task-detail page.
 * Submits any open required ISO records (→ under_review for PM approval), or —
 * when the task has no required records — completes the task directly.
 */
export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const svc = new ProjectQmsService(ctx);
		const body = (await event.request.json().catch(() => ({}))) as {
			note?: unknown;
			recordNotes?: Record<string, unknown>;
		};
		const recordNotes: Record<string, string> = {};
		if (body.recordNotes && typeof body.recordNotes === 'object') {
			for (const [k, v] of Object.entries(body.recordNotes)) {
				if (v != null) recordNotes[k] = String(v);
			}
		}
		const result = await svc.assigneeSubmitTask(event.params.id, event.params.taskId, {
			note: body.note === undefined ? undefined : body.note == null ? null : String(body.note),
			recordNotes
		});
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
