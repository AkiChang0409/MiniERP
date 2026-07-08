import { z } from 'zod';

export const ProposeTaskPlanInputSchema = z.object({
	projectId: z.string(),
	goal: z.string().min(1).describe('What the plan should cover (scope, deadline hints).')
});

export type ProposeTaskPlanInput = z.infer<typeof ProposeTaskPlanInputSchema>;
