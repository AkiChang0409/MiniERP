import { z } from 'zod';
import { DraftTaskRefSchema } from '../draft-action';

export const ProposeTaskPlanInputSchema = z.object({
	projectId: z.string(),
	prompt: z.string().min(1).describe('What the plan should cover (goal, scope, deadline hints).'),
	existingTasks: z.array(DraftTaskRefSchema).max(100).optional()
});

export type ProposeTaskPlanInput = z.infer<typeof ProposeTaskPlanInputSchema>;
