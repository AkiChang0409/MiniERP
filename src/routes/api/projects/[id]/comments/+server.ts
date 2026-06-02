import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import {
	createProjectApi,
	ProjectPermissionError,
	ProjectValidationError
} from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * TKMGMT9 — list and add comments on a project. The service extracts
 * `@username` mention tokens at write time so the client doesn't have to.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const comments = await project.listComments(event.params.id);
		return ok({ comments });
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);

		const body = (await event.request.json()) as { body?: string };
		if (!body.body || !body.body.trim()) {
			return fail('Comment body is required.', 400);
		}

		const result = await project.addComment({
			projectId: event.params.id,
			body: body.body
		});

		return ok(result, 201);
	} catch (e) {
		if (e instanceof ProjectValidationError) {
			return fail(e.message + ': ' + Object.values(e.fields).join('; '), 400);
		}
		if (e instanceof ProjectPermissionError) {
			return fail(e.message, 403);
		}
		return fail((e as Error).message, 500);
	}
};
