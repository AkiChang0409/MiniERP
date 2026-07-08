import { z } from 'zod';

export const ProposeAssignmentInputSchema = z.object({
	projectId: z.string(),
	goal: z.string().min(1).describe('Assignment objective, e.g. "balance load" or "give QC to John".')
});

export type ProposeAssignmentInput = z.infer<typeof ProposeAssignmentInputSchema>;
