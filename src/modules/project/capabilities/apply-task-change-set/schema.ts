import { z } from 'zod';
import { ProjectChangeSchema } from '../draft-action';

/**
 * Input for applying a confirmed `ProjectDraftAction`. Carries the same
 * `changes[]` the draft produced, plus the projectId. This is what the
 * orchestrator stages as the pending confirmation and executes on confirm.
 */
export const ApplyTaskChangeSetInputSchema = z.object({
	projectId: z.string(),
	changes: z.array(ProjectChangeSchema)
});

export type ApplyTaskChangeSetInput = z.infer<typeof ApplyTaskChangeSetInputSchema>;

export const ApplyTaskChangeSetOutputSchema = z.object({
	applied: z.array(
		z.object({
			action: z.string(),
			taskId: z.string().optional(),
			id: z.string().optional(),
			skipped: z.boolean().optional()
		})
	)
});

export type ApplyTaskChangeSetOutput = z.infer<typeof ApplyTaskChangeSetOutputSchema>;
