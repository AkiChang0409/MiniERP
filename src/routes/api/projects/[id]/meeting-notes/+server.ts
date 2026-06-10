import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import {
	createProjectApi,
	processMeetingTranscript
} from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * POST /api/projects/[id]/meeting-notes
 *   body: { rawTranscript: string, attendees?: string[] }
 *
 * v1 path: operator pastes/uploads the transcript text. The future
 * bot-in-meeting path (Zoom/Meet/Teams) would call the same endpoint with
 * a pre-transcribed payload from the bot SDK.
 */
export const POST: RequestHandler = async (event) => {
	if (!event.platform) {
		return fail('Cloudflare platform bindings are required', 500);
	}
	try {
		const body = (await event.request.json()) as {
			rawTranscript?: string;
			attendees?: string[];
		};
		if (!body.rawTranscript || !body.rawTranscript.trim()) {
			return fail('Provide rawTranscript.', 400);
		}

		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const shell = await project.getProjectShell(event.params.id);

		const result = await processMeetingTranscript(
			{
				rawTranscript: body.rawTranscript,
				projectName: shell.project.name,
				attendees: body.attendees
			},
			event.platform.env
		);

		return ok({ notes: result.notes, status: result.status });
	} catch (e) {
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
