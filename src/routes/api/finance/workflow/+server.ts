import type { RequestHandler } from './$types';

import { fail, ok } from '$platform/http';
import { createModuleContext } from '$platform/modules';
import { financeAgentManifest } from '$modules/finance';
import { startInstance } from '$platform/workflow/workflow-engine';

interface StartBody {
	workflowId?: string;
	intentHint?: string;
	tenantId?: string;
	source?: 'quick_action' | 'today_brief' | 'main_app' | 'agent_intent';
	categoryId?: string;
}

export const POST: RequestHandler = async (event) => {
	if (!event.platform) return fail('Cloudflare platform bindings are required', 500);
	const user = event.locals.user;
	if (!user) return fail('Unauthorized', 401);

	const body = (await event.request.json().catch(() => null)) as StartBody | null;
	if (!body) return fail('Invalid JSON body', 400);

	const ctx = await createModuleContext(event);
	const result = await startInstance({
		kv: ctx.env.KV,
		db: ctx.db,
		workflowId: body.workflowId ?? '',
		agentId: financeAgentManifest.id,
		agentVersion: financeAgentManifest.version,
		userId: user.id,
		userEmail: user.email,
		tenantId: body.tenantId ?? 'default',
		data: {
			source: body.source,
			intentHint: body.intentHint,
			...(body.categoryId ? { selectedCategoryId: body.categoryId } : {})
		}
	});

	return result.ok
		? ok({ workflowId: result.state.id, currentStep: result.state.step, status: result.state.status }, 201)
		: fail(result.message, result.status);
};
