import { runStructuredOutput } from '$platform/ai/ai-runtime';
import type { ProjectCapability } from '../types';
import { ProjectDraftActionSchema, type ProjectDraftAction } from '../draft-action';
import { ProposeRescheduleInputSchema, type ProposeRescheduleInput } from './schema';

/**
 * Stage-2 draft (design §12): propose task date changes as a reviewable change
 * set with before/after. R3, read-only — never persisted.
 */
const SYSTEM_PROMPT = `You propose a task reschedule as a CHANGE SET. Return JSON
matching the schema: type="project.task_change.proposal", the given projectId,
and a "changes" array where each item has action="reschedule", "taskId", a
"before" ({startDate,endDate}) and an "after" ({startDate,endDate}), plus a
"reason". Only include tasks whose dates actually change. List dependency/overrun
"risks". Always set requiresConfirmation=true. Output JSON only.`;

export const proposeRescheduleCapability: ProjectCapability<
	ProposeRescheduleInput,
	ProjectDraftAction
> = {
	id: 'project.propose-reschedule',
	description:
		'Propose task date changes as a reviewable before/after change set. Draft / suggestive — never persisted.',
	riskLevel: 'R3',
	inputSchema: ProposeRescheduleInputSchema,
	outputSchema: ProjectDraftActionSchema,

	async execute(input, ctx): Promise<ProjectDraftAction> {
		if (!ctx.env) throw new Error('project.propose-reschedule requires Workers AI env');
		const result = await runStructuredOutput({
			task: 'project.propose-reschedule',
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{
					role: 'user',
					content: `projectId: ${input.projectId}\nGoal: ${input.goal}\n\nTasks:\n${JSON.stringify(
						input.tasks
					)}\n\nReturn the proposal JSON.`
				}
			],
			schema: ProjectDraftActionSchema,
			schemaName: 'project.draft-action',
			schemaVersion: 'v1',
			modelHint: { capability: 'reasoning', priority: 'quality' },
			metadata: {
				tenantId: ctx.tenantId ?? 'default',
				userId: ctx.userId,
				capabilityId: 'project.propose-reschedule',
				promptVersion: 'v1',
				schemaVersion: 'v1',
				riskLevel: 'R3'
			},
			env: ctx.env
		});
		if (result.status !== 'success') {
			throw new Error(`Reschedule proposal failed (${result.status}).`);
		}
		return result.result.value;
	}
};
