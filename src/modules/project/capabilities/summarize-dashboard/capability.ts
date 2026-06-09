import { z } from 'zod';
import { runStructuredOutput } from '$platform/ai/ai-runtime';

/**
 * Epic 9 — AI Dashboards. Given the same numbers the dashboard already
 * shows (status counts, upcoming, overdue), return a 2-3 sentence
 * executive-style brief plus a list of risk flags ("3 projects at risk due
 * to resource constraints in Engineering").
 *
 * Why a tiny capability rather than asking the dashboard to do this inline?
 * Centralising prompt + schema in one file means we can later tweak the
 * tone, add caching, or fan out to a per-tenant model without touching the
 * route.
 */

const DashboardSummarySchema = z.object({
	headline: z.string().min(4),
	insights: z.array(z.string().min(4)).max(5),
	risks: z
		.array(
			z.object({
				title: z.string().min(2),
				severity: z.enum(['low', 'medium', 'high'])
			})
		)
		.max(4)
});

export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;

export interface SummarizeDashboardInput {
	statusSummary: Array<{ status: string; count: number }>;
	upcoming: Array<{ name: string; deadline: string | null; status: string }>;
	overdue: Array<{ name: string; deadline: string | null; daysOverdue: number }>;
}

const SYSTEM_PROMPT = `You are an executive briefer summarising project health
in one short paragraph and 3-5 short bullet insights. Be specific and concrete:
when a project appears in the overdue list, name it. When you call out a risk,
say *why*. Avoid filler like "according to the data". Output JSON only.`;

export async function summarizeDashboard(
	input: SummarizeDashboardInput,
	env: Env
): Promise<{ summary: DashboardSummary | null; status: string; errorMessage?: string }> {
	const messages = [
		{ role: 'system' as const, content: SYSTEM_PROMPT },
		{
			role: 'user' as const,
			content: `Status counts: ${JSON.stringify(input.statusSummary)}
Upcoming deadlines: ${JSON.stringify(input.upcoming)}
Overdue: ${JSON.stringify(input.overdue)}

Respond with JSON only.`
		}
	];

	const result = await runStructuredOutput({
		task: 'project.summarize-dashboard',
		messages,
		schema: DashboardSummarySchema,
		schemaName: 'project.dashboard-summary',
		schemaVersion: 'v1',
		modelHint: { capability: 'fast_classification', priority: 'latency' },
		metadata: {
			tenantId: 'default',
			capabilityId: 'project.summarize-dashboard',
			promptVersion: 'v1',
			schemaVersion: 'v1',
			riskLevel: 'R0'
		},
		env
	});

	if (result.status !== 'success') {
		return { summary: null, status: result.status };
	}
	return { summary: result.result.value, status: 'success' };
}
