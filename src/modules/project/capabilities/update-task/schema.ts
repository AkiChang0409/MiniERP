import { z } from 'zod';

/**
 * Subset of TaskUpdateInput (task-service.ts). This single write covers
 * reschedule (startDate/endDate + rescheduleReason) and assignment (assigneeId);
 * status/completedAt are system-managed and intentionally not accepted.
 */
export const UpdateTaskPatchSchema = z.object({
	name: z.string().optional(),
	description: z.string().nullable().optional(),
	startDate: z.string().nullable().optional(),
	endDate: z.string().nullable().optional(),
	assigneeId: z.string().nullable().optional(),
	estimatedHours: z.number().nullable().optional(),
	isMilestone: z.boolean().optional(),
	kind: z.enum(['task', 'milestone']).optional(),
	priority: z.enum(['P0', 'P1', 'P2', 'P3']).nullable().optional(),
	workflowStageId: z.string().nullable().optional(),
	progressPct: z.number().nullable().optional(),
	rescheduleReason: z.string().nullable().optional()
});

export const UpdateTaskInputSchema = z.object({
	taskId: z.string(),
	projectId: z.string(),
	patch: UpdateTaskPatchSchema
});

export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

export const UpdateTaskOutputSchema = z.object({ id: z.string() });
export type UpdateTaskOutput = z.infer<typeof UpdateTaskOutputSchema>;
