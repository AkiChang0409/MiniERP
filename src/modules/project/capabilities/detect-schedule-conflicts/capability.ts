import { runStructuredOutput } from '$platform/ai/ai-runtime';
import { createProjectApi } from '../../api';
import { compactTasks, ProjectDraftActionSchema, type ProjectDraftAction } from '../draft-action';
import type { ProjectCapability } from '../types';
import { DetectScheduleConflictsInputSchema, type DetectScheduleConflictsInput } from './schema';

/**
 * Stage-2 draft (design §12): detect scheduling conflicts (dependency order
 * violations, assignee overlaps, bad dates) and optionally propose reschedules
 * to fix them. R3, read-only — self-fetches tasks + dependencies.
 */
const SYSTEM_PROMPT = `You analyse a project schedule for conflicts: a task
starting before a dependency finishes, the same assignee double-booked across
overlapping dates, or impossible/empty dates. Return JSON matching the schema:
type="project.task_change.proposal", the given projectId, a "risks" array naming
each conflict in plain language, and a "changes" array with action="reschedule"
suggestions (taskId, before/after dates, reason) ONLY where a date change would
resolve a conflict (empty if none). Always set requiresConfirmation=true. Output
JSON only.`;

export const detectScheduleConflictsCapability: ProjectCapability<
	DetectScheduleConflictsInput,
	ProjectDraftAction
> = {
	id: 'project.detect-schedule-conflicts',
	description:
		'Detect schedule conflicts (dependency order, assignee overlap, bad dates) and optionally propose fixes. Draft / suggestive — never persisted.',
	riskLevel: 'R3',
	inputSchema: DetectScheduleConflictsInputSchema,
	outputSchema: ProjectDraftActionSchema,

	async execute(input, ctx): Promise<ProjectDraftAction> {
		if (!ctx.env) throw new Error('project.detect-schedule-conflicts requires Workers AI env');
		if (!ctx.moduleContext) {
			throw new Error('project.detect-schedule-conflicts requires a module context');
		}

		const { tasks, dependencies } = await createProjectApi(ctx.moduleContext).listTasks(
			input.projectId
		);

		const result = await runStructuredOutput({
			task: 'project.detect-schedule-conflicts',
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{
					role: 'user',
					content: `projectId: ${input.projectId}\n\nTasks:\n${JSON.stringify(
						compactTasks(tasks)
					)}\n\nDependencies:\n${JSON.stringify(dependencies)}\n\nReturn the proposal JSON.`
				}
			],
			schema: ProjectDraftActionSchema,
			schemaName: 'project.draft-action',
			schemaVersion: 'v1',
			modelHint: { capability: 'reasoning', priority: 'quality' },
			metadata: {
				tenantId: ctx.tenantId ?? 'default',
				userId: ctx.userId,
				capabilityId: 'project.detect-schedule-conflicts',
				promptVersion: 'v1',
				schemaVersion: 'v1',
				riskLevel: 'R3'
			},
			env: ctx.env
		});
		if (result.status !== 'success') {
			throw new Error(`Conflict detection failed (${result.status}).`);
		}
		return result.result.value;
	}
};
