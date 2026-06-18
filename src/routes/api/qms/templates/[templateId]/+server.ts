import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import { createProjectApi, ProjectPermissionError, ProjectValidationError } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * PATCH  /api/qms/templates/[templateId]  — edit a template (manager only)
 * DELETE /api/qms/templates/[templateId]  — retire (isActive=false)
 */
export const PATCH: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const body = (await event.request.json()) as Record<string, unknown>;
		const allowed = [
			'code',
			'name',
			'moduleCategory',
			'scope',
			'taskType',
			'responsibleRole',
			'fieldSchema',
			'fileTemplateUrl',
			'fileTemplateName',
			'requiresApproval',
			'isActive',
			'description',
			'orderIndex'
		];
		const patch: Record<string, unknown> = {};
		for (const k of allowed) {
			if (Object.prototype.hasOwnProperty.call(body, k)) patch[k] = body[k];
		}
		const result = await project.updateQmsTemplate(event.params.templateId, patch);
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
		const project = createProjectApi(ctx);
		const result = await project.archiveQmsTemplate(event.params.templateId);
		return ok(result);
	} catch (e) {
		if (e instanceof ProjectPermissionError) return fail(e.message, 403);
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
