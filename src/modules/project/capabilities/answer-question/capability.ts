import { z } from 'zod';
import { runStructuredOutput } from '$platform/ai/ai-runtime';

/**
 * Epic 7 — AI Chat for natural-language Q&A about a single project.
 *
 * The caller assembles a "context bundle" (project header + tasks + recent
 * comments + attachment filenames) and the LLM answers grounded in that
 * bundle. If it can't answer, it returns `needsHuman = true` so the UI can
 * offer to spin up a follow-up task.
 */

const AnswerSchema = z.object({
	answer: z.string().min(1),
	citations: z
		.array(
			z.object({
				kind: z.enum(['task', 'comment', 'attachment', 'project']),
				ref: z.string().min(1),
				excerpt: z.string().optional()
			})
		)
		.max(6),
	needsHuman: z.boolean(),
	suggestedFollowUp: z.string().optional()
});

export type ProjectAnswer = z.infer<typeof AnswerSchema>;

export interface AnswerQuestionInput {
	question: string;
	contextBundle: {
		project: { id: string; name: string; status: string; deadline: string | null };
		tasks: Array<{ id: string; name: string; status: string; assignee: string | null }>;
		recentComments: Array<{ author: string; body: string; createdAt: string }>;
		attachments: Array<{ id: string; fileName: string }>;
	};
}

const SYSTEM_PROMPT = `You answer factual questions about a single project,
grounded ONLY in the JSON context the user provides. If the data does not
contain the answer, set needsHuman=true and propose a one-line follow-up
question to bring back to a human. Cite the specific tasks / comments /
attachments you used by their id in the citations array. Output JSON only.`;

export async function answerProjectQuestion(
	input: AnswerQuestionInput,
	env: Env
): Promise<{ answer: ProjectAnswer | null; status: string }> {
	const messages = [
		{ role: 'system' as const, content: SYSTEM_PROMPT },
		{
			role: 'user' as const,
			content: `Question: ${input.question}

Project context:
${JSON.stringify(input.contextBundle, null, 2)}

Answer in JSON.`
		}
	];

	const result = await runStructuredOutput({
		task: 'project.answer-question',
		messages,
		schema: AnswerSchema,
		schemaName: 'project.answer',
		schemaVersion: 'v1',
		modelHint: { capability: 'reasoning', priority: 'balanced' },
		metadata: {
			tenantId: 'default',
			capabilityId: 'project.answer-question',
			promptVersion: 'v1',
			schemaVersion: 'v1',
			riskLevel: 'R0'
		},
		env
	});

	if (result.status !== 'success') {
		return { answer: null, status: result.status };
	}
	return { answer: result.result.value, status: 'success' };
}
