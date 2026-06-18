import { z } from 'zod';
import { DraftTaskRefSchema } from '../draft-action';

export const ProposeAssignmentInputSchema = z.object({
	projectId: z.string(),
	goal: z.string().min(1).describe('Assignment objective, e.g. "balance load" or "give QC to John".'),
	tasks: z.array(DraftTaskRefSchema).max(100),
	candidates: z
		.array(
			z.object({
				employeeId: z.string(),
				name: z.string(),
				currentLoad: z.number().optional()
			})
		)
		.max(100)
});

export type ProposeAssignmentInput = z.infer<typeof ProposeAssignmentInputSchema>;
