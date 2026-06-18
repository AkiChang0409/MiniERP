import { runStructuredOutput } from '$platform/ai/ai-runtime';
import type { ProjectCapability } from '../types';
import { ProjectDraftActionSchema, type ProjectDraftAction } from '../draft-action';
import { ProposeTaskPlanInputSchema, type ProposeTaskPlanInput } from './schema';

/**
 * Stage-2 draft (design §12): propose new tasks as a reviewable change set.
 * R3, read-only — returns a `ProjectDraftAction` (create changes + risks). The
 * caller previews it; a confirmed apply is a separate R4 write (plan Phase 8).
 */
const SYSTEM_PROMPT = `You propose a project task plan as a CHANGE SET, not prose.
Return JSON matching the schema: type="project.task_change.proposal", the given
projectId, and a "changes" array where each item has action="create", an "after"
object describing the new task ({name, startDate?, endDate?, assignee?}), and a
"reason". Do not propose changes to existing tasks here. List scheduling/scope
"risks". Always set requiresConfirmation=true. Output JSON only.`;

export const proposeTaskPlanCapability: ProjectCapability<ProposeTaskPlanInput, ProjectDraftAction> = {
	id: 'project.propose-task-plan',
	description:
		'Propose new project tasks as a reviewable change set (create-only). Draft / suggestive — never persisted.',
	riskLevel: 'R3',
	inputSchema: ProposeTaskPlanInputSchema,
	outputSchema: ProjectDraftActionSchema,

	async execute(input, ctx): Promise<ProjectDraftAction> {
		if (!ctx.env) throw new Error('project.propose-task-plan requires Workers AI env');
		const result = await runStructuredOutput({
			task: 'project.propose-task-plan',
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{
					role: 'user',
					content: `projectId: ${input.projectId}\nGoal: ${input.prompt}\n\nExisting tasks:\n${JSON.stringify(
						input.existingTasks ?? []
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
				capabilityId: 'project.propose-task-plan',
				promptVersion: 'v1',
				schemaVersion: 'v1',
				riskLevel: 'R3'
			},
			env: ctx.env
		});
		if (result.status !== 'success') {
			throw new Error(`Task plan proposal failed (${result.status}).`);
		}
		return result.result.value;
	}
};
