/**
 * Agent router: pick the domain expert agent for a message. Runs every
 * registered agent's domain classifier, applies a route-context prior (when the
 * AI Panel says we're on a project/finance/… page), and selects the highest
 * confidence. When two *different* domains tie closely, it returns `ambiguous`
 * so the orchestrator asks the user instead of guessing (design §9).
 */
import { listAgents } from './agent-registry';
import type {
	AgentIntentResult,
	DomainAgentPlugin,
	IntentClassificationInput,
	RuntimeContextEnvelope
} from './contracts';

export interface RouteCandidate {
	agent: DomainAgentPlugin;
	intent: AgentIntentResult;
}

export interface RouteDecision {
	kind: 'routed' | 'no_route' | 'ambiguous';
	agent?: DomainAgentPlugin;
	intent?: AgentIntentResult;
	candidates: RouteCandidate[];
}

/** Confidence added when the active route's module matches the agent's domain. */
const ROUTE_CONTEXT_BOOST = 0.15;
/** Below this gap between two different-domain leaders, treat as ambiguous. */
const AMBIGUITY_GAP = 0.1;

export function routeMessage(
	input: IntentClassificationInput,
	context?: RuntimeContextEnvelope
): RouteDecision {
	const moduleId = context?.routeContext?.moduleId;
	const scored: RouteCandidate[] = [];

	for (const agent of listAgents()) {
		const intent = agent.classifyIntent(input);
		if (!intent) continue;
		let confidence = intent.confidence;
		if (moduleId && agent.manifest.domain === moduleId) {
			confidence = Math.min(1, confidence + ROUTE_CONTEXT_BOOST);
		}
		scored.push({ agent, intent: { ...intent, confidence } });
	}

	if (scored.length === 0) return { kind: 'no_route', candidates: [] };

	scored.sort((a, b) => b.intent.confidence - a.intent.confidence);
	const [top, second] = scored;

	if (
		second &&
		top.agent.manifest.domain !== second.agent.manifest.domain &&
		top.intent.confidence - second.intent.confidence < AMBIGUITY_GAP
	) {
		return { kind: 'ambiguous', candidates: scored };
	}

	return { kind: 'routed', agent: top.agent, intent: top.intent, candidates: scored };
}
