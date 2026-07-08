import { z } from 'zod';

export const ProposeRescheduleInputSchema = z.object({
	projectId: z.string(),
	goal: z.string().min(1).describe('What the reschedule should achieve, e.g. "finish QC before Jun 23".')
});

export type ProposeRescheduleInput = z.infer<typeof ProposeRescheduleInputSchema>;
