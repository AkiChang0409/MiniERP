import type { RequestHandler } from './$types';

import { fail, ok } from '$platform/http';
import { createModuleContext } from '$platform/modules';
import {
	confirmWorkflow,
	type ConfirmBody
} from '$app-layer/workflow/finance-workflow-orchestrator';

export const POST: RequestHandler = async (event) => {
	if (!event.platform) return fail('Cloudflare platform bindings are required', 500);
	const user = event.locals.user;
	if (!user) return fail('Unauthorized', 401);

	const id = event.params.id;
	if (!id) return fail('Workflow id is required', 400);

	const body = (await event.request.json().catch(() => null)) as ConfirmBody | null;
	if (!body) return fail('Invalid JSON body', 400);

	const ctx = await createModuleContext(event);
	const result = await confirmWorkflow({
		env: event.platform.env,
		user,
		ctx,
		workflowInstanceId: id,
		body
	});

	return result.ok ? ok(result.data) : fail(result.message, result.status, result.details);
};
