import type { RequestHandler } from './$types';

import { fail, ok } from '$platform/http';
import { createModuleContext } from '$platform/modules';
import { financeAgentManifest } from '$modules/finance';
import { createFinanceCapabilityDeps } from '$app-layer/bootstrap/finance-capability-deps';
import { advanceInstance } from '$platform/workflow/workflow-engine';

interface AdvanceBody {
	targetStep: string;
	payload?: Record<string, unknown>;
}

export const POST: RequestHandler = async (event) => {
	if (!event.platform) return fail('Cloudflare platform bindings are required', 500);
	const user = event.locals.user;
	if (!user) return fail('Unauthorized', 401);

	const id = event.params.id;
	if (!id) return fail('Workflow id is required', 400);

	const body = (await event.request.json().catch(() => null)) as AdvanceBody | null;
	if (!body?.targetStep) return fail('targetStep is required', 400);

	const ctx = await createModuleContext(event);
	const result = await advanceInstance({
		kv: ctx.env.KV,
		instanceId: id,
		targetStep: body.targetStep,
		payload: body.payload,
		run: {
			agentId: financeAgentManifest.id,
			agentVersion: financeAgentManifest.version,
			user: ctx.user,
			db: ctx.db,
			env: ctx.env,
			useMock: true,
			capabilityDeps: createFinanceCapabilityDeps(ctx)
		}
	});

	return result.ok
		? ok({ currentStep: result.state.step, state: result.state })
		: fail(result.message, result.status, result.details);
};
