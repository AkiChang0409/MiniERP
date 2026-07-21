/**
 * Rolling conversation summary (P4.2 layer 3).
 *
 * When turns age out of the verbatim `history` window, they're folded into a
 * compact summary so long conversations keep context without unbounded token
 * growth. Best-effort: on any failure the caller keeps the prior summary.
 */
import { z } from 'zod';
import { runStructuredOutput } from '../ai-runtime';
import type { AgentConversationTurn } from './conversation-state';

const summarySchema = z.object({ summary: z.string() });

const SYSTEM_PROMPT = `You maintain a running summary of a chat between a user and
an ERP assistant. Given the PREVIOUS SUMMARY (may be empty) and OLDER TURNS that
are dropping out of the recent window, return an updated concise summary that
preserves durable facts: entities the user referred to (project/task/customer
ids + names), decisions, pending intents, and preferences. Keep it under ~120
words. Drop small talk. Output JSON only: {"summary": "..."}.`;

/**
 * Fold `dropped` turns into the prior summary. Returns the new summary, or the
 * prior summary unchanged if the model is unavailable/errors.
 */
export async function summarizeConversation(
	env: Env,
	priorSummary: string | undefined,
	dropped: AgentConversationTurn[],
	meta?: { tenantId?: string; userId?: string }
): Promise<string> {
	const prior = priorSummary?.trim() ? `PREVIOUS SUMMARY:\n${priorSummary}\n\n` : '';
	const turnsText = dropped.map((t) => `${t.role}: ${t.text}`).join('\n');

	const res = await runStructuredOutput({
		task: 'conversation_summary',
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: `${prior}OLDER TURNS:\n${turnsText}\n\nReturn the updated summary as JSON.` }
		],
		schema: summarySchema,
		schemaName: 'conversation.summary',
		schemaVersion: 'v1',
		metadata: {
			tenantId: meta?.tenantId ?? 'default',
			userId: meta?.userId,
			capabilityId: 'orchestrator.conversation-summary',
			promptVersion: 'v1'
		},
		env
	});

	if (res.status !== 'success') return priorSummary ?? '';
	return res.result.value.summary.trim() || (priorSummary ?? '');
}
