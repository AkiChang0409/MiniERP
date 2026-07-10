/**
 * LLM router. The orchestrator uses this as the normal routing path when a
 * module env is available; keyword classifiers are retained only for legacy
 * contexts that cannot run an LLM route.
 */
import { z } from 'zod';
import { runStructuredOutput } from '../ai-runtime';
import { listAgents } from './agent-registry';

const routeSchema = z.object({
	domain: z.string(),
	intent: z.string().default(''),
	confidence: z.number().min(0).max(1).default(0.5),
	reply: z.string().default('')
});

export type LlmRouteResult =
	| { kind: 'agent'; agentId: string; domain: string; intent: string; confidence: number }
	| { kind: 'smalltalk'; reply: string }
	| { kind: 'none' };

export async function llmRouteMessage(text: string, env: Env): Promise<LlmRouteResult> {
	const agents = listAgents();
	if (agents.length === 0) return { kind: 'none' };

	const catalog = agents.map((a) => `- ${a.manifest.domain}: ${a.manifest.description}`).join('\n');
	const domains = agents.map((a) => a.manifest.domain);
	const system = `You route a message for a business ERP assistant to the right domain.
Domains:
${catalog}

Rules:
- Pick the single best domain from the list for a business question/request.
- Use "smalltalk" for greetings / chit-chat / thanks / meta questions about you.
- Use "none" only when it is clearly unrelated to any domain and not small talk.
- For smalltalk, write a short friendly reply (in the user's language) in "reply", inviting them to ask about their projects, finance, HR, inventory, or customers.
Output ONLY JSON: {"domain": <one of ${JSON.stringify([...domains, 'smalltalk', 'none'])}>, "intent": string, "confidence": number 0..1, "reply": string}.`;

	const res = await runStructuredOutput({
		task: 'orchestrator.route',
		messages: [
			{ role: 'system', content: system },
			{ role: 'user', content: text }
		],
		schema: routeSchema,
		schemaName: 'orchestrator.route',
		schemaVersion: 'v1',
		modelHint: { capability: 'fast_classification', priority: 'latency' },
		metadata: {
			tenantId: 'default',
			capabilityId: 'orchestrator.route',
			promptVersion: 'v1'
		},
		env
	});
	if (res.status !== 'success') return { kind: 'none' };

	const d = res.result.value;
	if (d.domain === 'smalltalk') {
		return {
			kind: 'smalltalk',
			reply:
				d.reply.trim() ||
				'Hi! I can help with your projects, finance, HR, inventory, or customers — what do you need?'
		};
	}
	const agent = agents.find((a) => a.manifest.domain === d.domain);
	if (!agent) return { kind: 'none' };
	return {
		kind: 'agent',
		agentId: agent.manifest.id,
		domain: agent.manifest.domain,
		intent: d.intent || 'llm_routed',
		confidence: d.confidence
	};
}
