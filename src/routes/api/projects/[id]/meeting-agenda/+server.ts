import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import {
	createProjectApi,
	draftMeetingAgenda
} from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * POST /api/projects/[id]/meeting-agenda
 *   body: { objective: string, desiredMinutes?: number }
 *
 * Generates an editable agenda from the project's open tasks + recent
 * comments. The UI shows the draft and lets the user accept/edit before
 * sending invites. Returns JSON only — invites go out via the calendar
 * OAuth flow (Epic 5).
 */
export const POST: RequestHandler = async (event) => {
	if (!event.platform) {
		return fail('Cloudflare platform bindings are required', 500);
	}
	try {
		const body = (await event.request.json()) as {
			objective?: string;
			desiredMinutes?: number;
		};
		if (!body.objective || !body.objective.trim()) {
			return fail('Provide a meeting objective.', 400);
		}

		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);

		const [shell, taskData, comments] = await Promise.all([
			project.getProjectShell(event.params.id),
			project.listTasks(event.params.id),
			project.listComments(event.params.id)
		]);

		const openTasks = taskData.tasks
			.filter((t) => t.status !== 'completed')
			.slice(0, 25)
			.map((t) => t.name);

		const recentComments = comments.slice(0, 10).map((c) => c.body.slice(0, 240));

		const result = await draftMeetingAgenda(
			{
				projectName: shell.project.name,
				objective: body.objective,
				openTaskNames: openTasks,
				recentComments,
				desiredMinutes: body.desiredMinutes
			},
			event.platform.env
		);

		return ok({ agenda: result.agenda, status: result.status });
	} catch (e) {
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
