import { z } from 'zod';
import { runStructuredOutput } from '$platform/ai/ai-runtime';

/**
 * LLM response summarizer for successful HR capability results.
 *
 * Turns a capability's result JSON into a concise natural-language Lark reply.
 * STRICTLY grounded: the model is told to use only the provided result data and
 * never to invent values or claim actions not reflected in it. Returns null on
 * any failure (no provider / invalid output / error) so the caller falls back to
 * the fixed template. Only used for ok results of list / submit / approve —
 * confirmation codes, permission denials, validation errors, and unknown replies
 * keep their fixed templates.
 */

const summarySchema = z.object({ reply: z.string().min(1) });

const SYSTEM_PROMPT = `You write a short HR assistant reply for a Lark chat, in the user's language (default Chinese).

STRICT RULES:
- Use ONLY the data in the provided result JSON. Do NOT invent names, dates, counts, ids, or statuses.
- Do NOT claim any action happened beyond what the result shows. If the result lists pending requests, you are reporting them — you did not approve or change anything.
- Be concise: 1–3 short lines. For a list, give the count and the key items (person / type / dates / id). For a create/approve result, confirm what was recorded using the returned fields.
- No markdown fences. Output ONLY JSON: { "reply": string }.`;

export async function summarizeHrResult(
	env: Env,
	args: { capabilityId: string; result: unknown; userText: string }
): Promise<string | null> {
	try {
		const userContent = [
			`Capability: ${args.capabilityId}`,
			`User asked: ${args.userText}`,
			`Result JSON:`,
			JSON.stringify(args.result ?? {})
		].join('\n');

		const result = await runStructuredOutput({
			task: 'hr-result-summary',
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content: userContent }
			],
			schema: summarySchema,
			schemaName: 'hr-result-summary',
			schemaVersion: 'v1',
			modelHint: { capability: 'fast_classification', priority: 'latency' },
			metadata: {
				tenantId: 'default',
				agentId: 'hr-agent',
				capabilityId: 'hr.result-summary',
				promptVersion: 'v1',
				schemaVersion: 'v1'
			},
			env
		});
		if (result.status !== 'success') return null;
		const reply = result.result.value.reply.trim();
		return reply.length > 0 ? reply : null;
	} catch {
		return null;
	}
}
