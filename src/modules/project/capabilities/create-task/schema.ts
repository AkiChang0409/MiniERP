import { z } from 'zod';

/** Subset of TaskCreateInput (task-service.ts) exposed to the agent. */
export const CreateTaskInputSchema = z.object({
	projectId: z.string(),
	name: z.string().min(1),
	description: z.string().optional(),
	startDate: z.string().nullable().optional(),
	endDate: z.string().nullable().optional(),
	assigneeId: z.string().nullable().optional(),
	estimatedHours: z.number().nullable().optional(),
	isMilestone: z.boolean().optional(),
	kind: z.enum(['task', 'milestone']).optional(),
	priority: z.enum(['P0', 'P1', 'P2', 'P3']).nullable().optional(),
	workflowStageId: z.string().nullable().optional()
});

export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

export const CreateTaskOutputSchema = z.object({ id: z.string() });
export type CreateTaskOutput = z.infer<typeof CreateTaskOutputSchema>;
