import type { RequestHandler } from './$types';

import { fail, ok } from '$platform/http';
import {
	startFinanceWorkflow,
	type StartBody
} from '$app-layer/workflow/finance-workflow-orchestrator';

export const POST: RequestHandler = async (event) => {
	if (!event.platform) return fail('Cloudflare platform bindings are required', 500);
	const user = event.locals.user;
	if (!user) return fail('Unauthorized', 401);

	const body = (await event.request.json().catch(() => null)) as StartBody | null;
	if (!body) return fail('Invalid JSON body', 400);

	const result = await startFinanceWorkflow({ env: event.platform.env, user, body });

	return result.ok ? ok(result.data, 201) : fail(result.message, result.status);
};
