import { z } from 'zod';

/** Agent-facing input contract for `project.draft-meeting-agenda`. */
export const DraftAgendaInputSchema = z.object({
	projectName: z.string().min(1),
	objective: z.string().min(1),
	openTaskNames: z.array(z.string()),
	recentComments: z.array(z.string()),
	desiredMinutes: z.number().int().min(5).max(240).optional()
});
