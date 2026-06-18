import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import {
	answerProjectQuestion,
	createProjectApi
} from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * POST /api/projects/[id]/chat   body: { question: string }
 *
 * AI Q&A grounded in this project's data (tasks + recent comments +
 * attachment filenames). The capability returns citations so the UI can
 * link the answer back to the source rows.
 */
export const POST: RequestHandler = async (event) => {
	if (!event.platform) {
		return fail('Cloudflare platform bindings are required', 500);
	}
	try {
		const body = (await event.request.json()) as { question?: string };
		const question = (body.question ?? '').trim();
		if (!question) return fail('Provide a question.', 400);

		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);

		const [shell, taskData, comments, attachments] = await Promise.all([
			project.getProjectShell(event.params.id),
			project.listTasks(event.params.id),
			project.listComments(event.params.id),
			project.listAttachments(event.params.id)
		]);

		const answer = await answerProjectQuestion(
			{
				question,
				contextBundle: {
					project: {
						id: shell.project.id,
						name: shell.project.name,
						status: shell.project.status,
						deadline: shell.project.deadline ?? null
					},
					tasks: taskData.tasks.map((t) => ({
						id: t.id,
						name: t.name,
						status: t.status,
						assignee: t.assigneeName ?? t.assigneeEmail ?? null
					})),
					recentComments: comments.slice(0, 25).map((c) => ({
						author: c.authorName ?? c.authorEmail ?? 'Unknown',
						body: c.body,
						createdAt: c.createdAt
					})),
					attachments: attachments.map((a) => ({ id: a.id, fileName: a.fileName }))
				}
			},
			event.platform.env
		);

		return ok({ answer: answer.answer, status: answer.status });
	} catch (e) {
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
