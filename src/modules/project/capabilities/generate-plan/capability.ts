import { runStructuredOutput } from '$platform/ai/ai-runtime';
import type { ProjectCapability } from '../types';
import {
	GeneratedPlanSchema,
	GeneratePlanInputSchema,
	type GeneratedPlan
} from './schema';

/**
 * Epic 1 — AI Project Manager.
 *
 * Take a free-form description like "Renovate the beachfront restaurant by
 * June" and produce a complete editable plan (tasks, durations, optional
 * stages, optional dependencies). The route layer is responsible for showing
 * the plan as an editable preview before anything is written to the DB —
 * matches the BaseLine §3.6 "AI is suggestive, not authoritative" rule.
 */

export interface GeneratePlanInput {
	prompt: string;
	knownStartDate?: string | null;
	knownDeadline?: string | null;
	historicalDurations?: Array<{ projectName: string; durationDays: number }>;
}

export interface GeneratePlanRun {
	plan: GeneratedPlan | null;
	status: 'success' | 'invalid_output' | 'no_provider' | 'unknown_error';
	errorMessage?: string;
}

const SYSTEM_PROMPT = `You are an experienced project planning assistant.
Given a high-level project description, return a JSON object matching the
provided schema.

Rules:
 1. Tasks should be sequenced naturally — earlier tasks first.
 2. \`durationDays\` is the number of working-ish days the task takes; aim for
    realistic, slightly conservative numbers.
 3. \`startOffsetDays\` is the number of days after the project's start the
    task begins. Default to 0 for the first task; later tasks should respect
    \`dependsOnIndices\` so they don't start before their prerequisites finish.
 4. \`dependsOnIndices\` references the index (0-based) of an earlier task in
    the same list. Skip the field when no dependency applies.
 5. Mark anchor decision points (kickoff, go-live, hand-off) with
    \`isMilestone: true\` and \`durationDays: 1\`.
 6. \`stages\` is an ordered list of phase names (e.g. ["Discovery",
    "Design", "Build", "Launch"]). Optional but encouraged when the plan has
    >5 tasks.
 7. \`confidence\` reflects YOUR estimate of how trustworthy the dates are
    given the brevity of the prompt. Use 0.4-0.6 for vague prompts,
    0.7-0.85 for specific ones.
 8. The plan must contain at least one task and at most 30.`;

export async function generateProjectPlan(
	input: GeneratePlanInput,
	env: Env
): Promise<GeneratePlanRun> {
	if (!input.prompt || !input.prompt.trim()) {
		return { plan: null, status: 'unknown_error', errorMessage: 'Empty prompt.' };
	}

	const userContent = [
		`Project description: ${input.prompt}`,
		input.knownStartDate ? `Target start date: ${input.knownStartDate}` : null,
		input.knownDeadline ? `Target deadline: ${input.knownDeadline}` : null,
		input.historicalDurations && input.historicalDurations.length > 0
			? `Recent similar projects (for calibration):\n${input.historicalDurations
					.map((h) => `- "${h.projectName}" took ${h.durationDays} days`)
					.join('\n')}`
			: null,
		'Return JSON conforming to the schema. Do not include explanatory prose.'
	]
		.filter(Boolean)
		.join('\n\n');

	const result = await runStructuredOutput({
		task: 'project.generate-plan',
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: userContent }
		],
		schema: GeneratedPlanSchema,
		schemaName: 'project.generated-plan',
		schemaVersion: 'v1',
		modelHint: { capability: 'reasoning', priority: 'quality' },
		metadata: {
			tenantId: 'default',
			capabilityId: 'project.generate-plan',
			promptVersion: 'v1',
			schemaVersion: 'v1',
			riskLevel: 'R1'
		},
		env
	});

	if (result.status !== 'success') {
		return {
			plan: null,
			status: result.status,
			errorMessage: result.status === 'invalid_output' ? 'AI output failed schema check.' : undefined
		};
	}

	return { plan: result.result.value, status: 'success' };
}

/**
 * Registered (SDK-for-agent) wrapper. Thin: forwards to `generateProjectPlan`
 * using the Workers AI env from the capability context and throws on failure so
 * the governed executor can surface the error. The route layer keeps calling
 * `generateProjectPlan` directly for its richer status-code handling.
 */
export const generatePlanCapability: ProjectCapability<GeneratePlanInput, GeneratedPlan> = {
	id: 'project.generate-plan',
	description:
		'Turn a free-form project description into an editable plan (tasks, durations, optional stages and dependencies). Suggestive only — not persisted.',
	riskLevel: 'R1',
	inputSchema: GeneratePlanInputSchema,
	outputSchema: GeneratedPlanSchema,

	async execute(input, ctx) {
		if (!ctx.env) throw new Error('project.generate-plan requires Workers AI env');
		const run = await generateProjectPlan(input, ctx.env);
		if (run.status !== 'success' || !run.plan) {
			throw new Error(run.errorMessage ?? `Plan generation failed (${run.status}).`);
		}
		return run.plan;
	}
};
