import { z } from 'zod';
import { DraftTaskRefSchema } from '../draft-action';

export const ProposeRescheduleInputSchema = z.object({
	projectId: z.string(),
	goal: z.string().min(1).describe('What the reschedule should achieve.'),
	tasks: z.array(DraftTaskRefSchema).max(100)
});

export type ProposeRescheduleInput = z.infer<typeof ProposeRescheduleInputSchema>;
