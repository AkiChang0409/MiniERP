import { z } from 'zod';

/** Agent-facing input contract for `project.summarize-dashboard`. */
export const SummarizeDashboardInputSchema = z.object({
	statusSummary: z.array(
		z.object({
			status: z.string(),
			count: z.number()
		})
	),
	upcoming: z.array(
		z.object({
			name: z.string(),
			deadline: z.string().nullable(),
			status: z.string()
		})
	),
	overdue: z.array(
		z.object({
			name: z.string(),
			deadline: z.string().nullable(),
			daysOverdue: z.number()
		})
	)
});
