import { z } from 'zod';
import { runStructuredOutput } from '$platform/ai/ai-runtime';
import type { ProjectCapability } from '../types';
import { ExtractTasksInputSchema } from './schema';

/**
 * Epic 10 — Docs Assistant. Given raw text extracted from a contract, MoM,
 * SoW, etc., suggest a list of tasks with deadlines for the user to review.
 *
 * Text extraction itself is delegated to the existing `text-extraction`
 * helper in `$platform/ai` — this capability only handles the LLM step.
 */

const ExtractedTaskSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	dueDate: z.string().nullable(),
	owner: z.string().nullable().optional(),
	confidence: z.number().min(0).max(1),
	sourceQuote: z.string().optional()
});

const ExtractedTasksSchema = z.object({
	tasks: z.array(ExtractedTaskSchema).max(40),
	decisions: z.array(z.string().min(1)).max(20),
	summary: z.string()
});

export type ExtractedTaskBundle = z.infer<typeof ExtractedTasksSchema>;

export interface ExtractTasksInput {
	rawText: string;
	projectId?: string | null;
	projectName?: string | null;
}

const SYSTEM_PROMPT = `Read the supplied document text and extract:
 1. ACTION ITEMS — anything the document obliges someone to deliver, with a
    due date if mentioned ("Contractor to deliver tiles by March 15" →
    name: "Deliver tiles", dueDate: "<closest ISO date>", owner: "Contractor",
    confidence: 0.9, sourceQuote: "Contractor to deliver tiles by March 15").
    Skip phrases that are merely descriptive.
 2. DECISIONS — short bullet statements of decisions that were made
    ("Approved budget increase of 5%").
 3. A two-sentence summary of the doc.

Output JSON only. confidence is your honest estimate of how likely this is
an actual task vs filler.`;

export async function extractTasksFromText(
	input: ExtractTasksInput,
	env: Env
): Promise<{ bundle: ExtractedTaskBundle | null; status: string }> {
	if (!input.rawText || !input.rawText.trim()) {
		return { bundle: null, status: 'empty_input' };
	}
	// LLM cost guard — truncate very long documents. The user can re-run on
	// a smaller slice if they need more.
	const text = input.rawText.slice(0, 24_000);

	const messages = [
		{ role: 'system' as const, content: SYSTEM_PROMPT },
		{
			role: 'user' as const,
			content: `${input.projectName ? `Project: ${input.projectName}\n` : ''}Document:
"""
${text}
"""

Respond with JSON only.`
		}
	];

	const result = await runStructuredOutput({
		task: 'project.extract-tasks',
		messages,
		schema: ExtractedTasksSchema,
		schemaName: 'project.extracted-tasks',
		schemaVersion: 'v1',
		modelHint: { capability: 'long_context', priority: 'quality' },
		metadata: {
			tenantId: 'default',
			capabilityId: 'project.extract-tasks',
			promptVersion: 'v1',
			schemaVersion: 'v1',
			riskLevel: 'R1'
		},
		env
	});

	if (result.status !== 'success') {
		return { bundle: null, status: result.status };
	}
	return { bundle: result.result.value, status: 'success' };
}

/** Registered (SDK-for-agent) wrapper — forwards to `extractTasksFromText`. */
export const extractTasksCapability: ProjectCapability<ExtractTasksInput, ExtractedTaskBundle> = {
	id: 'project.extract-tasks',
	description:
		'Extract suggested action items, decisions and a short summary from document text (contract / MoM / SoW). Suggestive only — the user reviews before tasks are created.',
	riskLevel: 'R1',
	inputSchema: ExtractTasksInputSchema,
	outputSchema: ExtractedTasksSchema,

	async execute(input, ctx) {
		if (!ctx.env) throw new Error('project.extract-tasks requires Workers AI env');
		const run = await extractTasksFromText(input, ctx.env);
		if (run.status !== 'success' || !run.bundle) {
			throw new Error(`Task extraction failed (${run.status}).`);
		}
		return run.bundle;
	}
};
