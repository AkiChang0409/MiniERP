import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import {
	createProjectApi,
	extractTasksFromText
} from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * POST /api/projects/[id]/extract-tasks
 *   body: { rawText: string } — accepts pre-extracted text
 *
 * Returns AI-suggested tasks + decisions + a summary. The user reviews and
 * promotes them via the standard task-create route. We deliberately don't
 * write tasks here — keeps "AI is suggestive" honest.
 *
 * (For raw PDFs / docx / etc., the document-intake module already runs
 * OCR + text extraction; the front-end can pull rawText from
 * `/api/documents/[id]/intake` and POST it here.)
 */
export const POST: RequestHandler = async (event) => {
	if (!event.platform) {
		return fail('Cloudflare platform bindings are required', 500);
	}
	try {
		const body = (await event.request.json()) as { rawText?: string };
		const rawText = body.rawText ?? '';
		if (!rawText.trim()) return fail('Provide `rawText`.', 400);

		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		// Resolve the project name so the LLM has a hint about scope.
		const shell = await project.getProjectShell(event.params.id);

		const result = await extractTasksFromText(
			{
				rawText,
				projectId: shell.project.id,
				projectName: shell.project.name
			},
			event.platform.env
		);

		return ok({ bundle: result.bundle, status: result.status });
	} catch (e) {
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
