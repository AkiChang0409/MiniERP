import { z } from 'zod';

export const DetectScheduleConflictsInputSchema = z.object({
	projectId: z.string(),
	tasks: z
		.array(
			z.object({
				id: z.string(),
				name: z.string(),
				startDate: z.string().nullable().optional(),
				endDate: z.string().nullable().optional(),
				assignee: z.string().nullable().optional(),
				dependsOn: z.array(z.string()).optional()
			})
		)
		.max(200)
});

export type DetectScheduleConflictsInput = z.infer<typeof DetectScheduleConflictsInputSchema>;
