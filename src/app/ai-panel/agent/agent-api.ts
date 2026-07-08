/**
 * Client wrapper for the unified orchestrator inbound route. The AI Panel calls
 * this to send a natural-language message (or a structured confirm/cancel) and
 * render the returned `OrchestratorResult`. (Mirrors the finance-workflow-api
 * fetch pattern.)
 */
import type { OrchestratorResult, RouteContext } from '$platform/ai/orchestrator';

export interface SendAgentInput {
	message: string;
	conversationId: string;
	routeContext?: RouteContext;
	confirm?: { actionId: string };
	cancel?: boolean;
}

export async function sendAgentMessage(input: SendAgentInput): Promise<OrchestratorResult> {
	const res = await fetch('/api/ai/agent', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input)
	});
	const body = (await res.json().catch(() => null)) as
		| { ok: true; data: OrchestratorResult }
		| { ok: false; error: string }
		| null;
	if (!body) throw new Error(`Agent request failed (${res.status})`);
	if (!body.ok) throw new Error(body.error || `Agent request failed (${res.status})`);
	return body.data;
}
