import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import {
	createProjectApi,
	ProjectPermissionError,
	ProjectValidationError
} from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * TKMGMT1 / TKMGMT2 / TKMGMT3 — manage the collaborator roster.
 *
 * GET   /api/projects/[id]/collaborators
 * POST  /api/projects/[id]/collaborators   body: { email | userId, role? }
 */
export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const collaborators = await project.listCollaborators(event.params.id);
		return ok({ collaborators });
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);

		// Crucial — adding a collaborator is treated as an owner/manager-only
		// action since it affects who can see the project. Verify scope first.
		const scope = await project.getEditableScope(event.params.id);
		if (scope !== 'owner' && scope !== 'manager') {
			return fail(
				'Only the project owner or a manager may add collaborators.',
				403
			);
		}

		const body = (await event.request.json()) as {
			email?: string;
			userId?: string;
			role?: string | null;
		};

		if (body.userId) {
			const result = await project.addCollaborator({
				projectId: event.params.id,
				userId: body.userId,
				role: body.role ?? null
			});
			return ok(result, 201);
		}
		if (body.email) {
			const result = await project.addCollaboratorByEmail({
				projectId: event.params.id,
				email: body.email,
				role: body.role ?? null
			});
			return ok(result, 201);
		}
		return fail('Either userId or email is required.', 400);
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
