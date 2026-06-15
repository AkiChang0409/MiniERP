import { z } from 'zod';

/** Agent-facing input contract for `project.extract-tasks`. */
export const ExtractTasksInputSchema = z.object({
	rawText: z.string().min(1),
	projectId: z.string().nullable().optional(),
	projectName: z.string().nullable().optional()
});
