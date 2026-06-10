import type { RequestHandler } from './$types';

import { fail, ok } from '$platform/http';
import {
	advanceWorkflow,
	type AdvancePayload
} from '$app-layer/workflow/finance-workflow-orchestrator';

interface AdvanceBody {
	targetStep: string;
	payload?: AdvancePayload;
}

export const POST: RequestHandler = async (event) => {
	if (!event.platform) return fail('Cloudflare platform bindings are required', 500);
	const user = event.locals.user;
	if (!user) return fail('Unauthorized', 401);

	const id = event.params.id;
	if (!id) return fail('Workflow id is required', 400);

	const body = (await event.request.json().catch(() => null)) as AdvanceBody | null;
	if (!body?.targetStep) return fail('targetStep is required', 400);

	const result = await advanceWorkflow({
		env: event.platform.env,
		user,
		workflowInstanceId: id,
		targetStep: body.targetStep,
		payload: body.payload
	});

	return result.ok ? ok(result.data) : fail(result.message, result.status);
};
