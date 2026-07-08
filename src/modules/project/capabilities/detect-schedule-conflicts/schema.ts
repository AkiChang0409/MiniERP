import { z } from 'zod';

export const DetectScheduleConflictsInputSchema = z.object({
	projectId: z.string()
});

export type DetectScheduleConflictsInput = z.infer<typeof DetectScheduleConflictsInputSchema>;
