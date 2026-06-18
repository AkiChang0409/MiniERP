import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import { createProjectApi, ProjectPermissionError, ProjectValidationError } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * GET  /api/qms/templates?includeInactive=1 → { templates }
 * POST /api/qms/templates                   body: QmsTemplateInput (manager only)
 */
export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const includeInactive = event.url.searchParams.get('includeInactive') === '1';
		const templates = await project.listQmsTemplates({ includeInactive });
		return ok({ templates });
	} catch (e) {
		if (e instanceof ProjectPermissionError) return fail(e.message, 403);
		return fail((e as Error).message, 500);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const body = (await event.request.json()) as Record<string, unknown>;
		const result = await project.createQmsTemplate({
			code: String(body.code ?? ''),
			name: String(body.name ?? ''),
			moduleCategory: body.moduleCategory == null ? null : String(body.moduleCategory),
			scope: (body.scope as 'company' | 'project' | 'task') ?? undefined,
			taskType: body.taskType == null ? null : String(body.taskType),
			responsibleRole: body.responsibleRole == null ? null : String(body.responsibleRole),
			fieldSchema: body.fieldSchema == null ? null : String(body.fieldSchema),
			fileTemplateUrl: body.fileTemplateUrl == null ? null : String(body.fileTemplateUrl),
			fileTemplateName: body.fileTemplateName == null ? null : String(body.fileTemplateName),
			requiresApproval: Boolean(body.requiresApproval),
			isActive: body.isActive == null ? true : Boolean(body.isActive),
			description: body.description == null ? null : String(body.description),
			orderIndex: body.orderIndex == null ? undefined : Number(body.orderIndex)
		});
		return ok(result, 201);
	} catch (e) {
		if (e instanceof ProjectValidationError) {
			return fail(e.message + ': ' + Object.values(e.fields).join('; '), 400);
		}
		if (e instanceof ProjectPermissionError) return fail(e.message, 403);
		return fail((e as Error).message, 500);
	}
};
