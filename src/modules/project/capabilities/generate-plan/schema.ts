import { z } from 'zod';

/**
 * Zod schema the LLM must hit. The AI runtime auto-retries once when output
 * doesn't validate, so a tight schema buys us self-correcting behaviour.
 *
 * `confidence` is the LLM's own subjective score (0-1) for the deadline
 * estimate; the UI shows it next to the "use this plan" button so the user
 * knows whether to trust the dates blindly.
 */
export const PlanTaskSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	durationDays: z.number().int().min(1).max(365),
	startOffsetDays: z.number().int().min(0).max(720).optional(),
	dependsOnIndices: z.array(z.number().int().min(0)).optional(),
	isMilestone: z.boolean().optional(),
	estimatedHours: z.number().int().min(1).optional(),
	stageName: z.string().optional()
});

export const GeneratedPlanSchema = z.object({
	projectName: z.string().min(1),
	description: z.string().optional(),
	totalDurationDays: z.number().int().min(1).max(720),
	confidence: z.number().min(0).max(1),
	stages: z.array(z.string()).optional(),
	tasks: z.array(PlanTaskSchema).min(1)
});

export type GeneratedPlan = z.infer<typeof GeneratedPlanSchema>;
export type PlanTask = z.infer<typeof PlanTaskSchema>;
