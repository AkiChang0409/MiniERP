import type { RequestHandler } from './$types';

import { fail, ok } from '$platform/http';
import { createModuleContext } from '$platform/modules';
import type { InboundAgentMessage, RouteContext } from '$platform/ai/orchestrator';
import { runSmartFinOrchestrator } from '$app-layer/ai/orchestrator/create-smartfin-orchestrator';

interface AgentMessageBody {
	message?: string;
	conversationId?: string;
	routeContext?: RouteContext;
	intentHint?: string;
}

/**
 * Unified AI Panel inbound entry. Normalizes the request into an
 * `InboundAgentMessage` and hands it to the orchestrator. Phase 3: the
 * orchestrator routes read-only (reports the resolved agent + intent). The
 * dynamic tool loop that executes capabilities lands in plan Phase 5.
 */
export const POST: RequestHandler = async (event) => {
	if (!event.platform) return fail('Cloudflare platform bindings are required', 500);
	const user = event.locals.user;
	if (!user) return fail('Unauthorized', 401);

	const body = (await event.request.json().catch(() => null)) as AgentMessageBody | null;
	if (!body) return fail('Invalid JSON body', 400);

	const text = (body.message ?? '').trim();
	if (!text) return fail('Missing message', 400);

	const inbound: InboundAgentMessage = {
		source: 'ai_panel',
		userId: user.id,
		roles: user.roles,
		conversationId: body.conversationId ?? `ai_panel:${user.id}`,
		text,
		routeContext: body.routeContext,
		metadata: body.intentHint ? { intentHint: body.intentHint } : undefined
	};

	// Request-scoped module context lets the orchestrator's entity resolvers call
	// module api facades (e.g. project name lookup).
	const moduleContext = await createModuleContext(event);
	const result = await runSmartFinOrchestrator(inbound, { moduleContext });
	return ok(result);
};
