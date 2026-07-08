import { z } from 'zod';

/**
 * Shared "draft action" contract for the project Stage-2 proposal capabilities
 * (design §12). These capabilities are R3 / read-only: they produce a structured
 * proposal with a before/after diff and risks for the user to review. NOTHING is
 * persisted — applying a confirmed proposal is a separate R4 write capability
 * (plan Phase 8).
 */
export const ProjectChangeSchema = z.object({
	taskId: z.string().optional(),
	action: z.enum(['create', 'update', 'reschedule', 'assign', 'notify']),
	before: z.unknown().optional(),
	after: z.unknown(),
	reason: z.string()
});

export const ProjectDraftActionSchema = z.object({
	type: z.literal('project.task_change.proposal'),
	projectId: z.string(),
	changes: z.array(ProjectChangeSchema),
	risks: z.array(z.string()),
	requiresConfirmation: z.boolean()
});

export type ProjectChange = z.infer<typeof ProjectChangeSchema>;
export type ProjectDraftAction = z.infer<typeof ProjectDraftActionSchema>;

/** Compact task reference the caller supplies as context for proposals. */
export const DraftTaskRefSchema = z.object({
	id: z.string(),
	name: z.string(),
	status: z.string().optional(),
	startDate: z.string().nullable().optional(),
	endDate: z.string().nullable().optional(),
	assignee: z.string().nullable().optional()
});

export type DraftTaskRef = z.infer<typeof DraftTaskRefSchema>;

/** Project the full task rows (from `listTasks`) into the compact refs the
 *  draft prompts consume. Keeps the LLM context small and stable. */
export function compactTasks(
	tasks: ReadonlyArray<{
		id: string;
		name: string;
		status?: string | null;
		startDate?: string | null;
		endDate?: string | null;
		assigneeId?: string | null;
	}>
): DraftTaskRef[] {
	return tasks.map((t) => ({
		id: t.id,
		name: t.name,
		status: t.status ?? undefined,
		startDate: t.startDate ?? null,
		endDate: t.endDate ?? null,
		assignee: t.assigneeId ?? null
	}));
}
