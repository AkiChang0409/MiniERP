import { runStructuredOutput } from '$platform/ai/ai-runtime';
import { createProjectApi } from '../../api';
import { compactTasks, ProjectDraftActionSchema, type ProjectDraftAction } from '../draft-action';
import type { ProjectCapability } from '../types';
import { ProposeAssignmentInputSchema, type ProposeAssignmentInput } from './schema';

/**
 * Stage-2 draft (design §12): propose task assignments as a reviewable change
 * set. R3, read-only — self-fetches the project's tasks and the assignable user
 * directory, then proposes assignments only from those candidates.
 */
const SYSTEM_PROMPT = `You propose task assignments as a CHANGE SET. Return JSON
matching the schema: type="project.task_change.proposal", the given projectId,
and a "changes" array where each item has action="assign", "taskId", an "after"
({assigneeId, assigneeName}), optional "before" ({assignee}), and a "reason".
Only assign from the provided candidates; use their exact id — never invent
people. Use the exact taskId from the task list. Flag overload/skill-mismatch
"risks". Always set requiresConfirmation=true. Output JSON only.`;

export const proposeAssignmentCapability: ProjectCapability<
	ProposeAssignmentInput,
	ProjectDraftAction
> = {
	id: 'project.propose-assignment',
	description:
		'Propose task assignments (from the project user directory) as a reviewable change set. Draft / suggestive — never persisted.',
	riskLevel: 'R3',
	inputSchema: ProposeAssignmentInputSchema,
	outputSchema: ProjectDraftActionSchema,

	async execute(input, ctx): Promise<ProjectDraftAction> {
		if (!ctx.env) throw new Error('project.propose-assignment requires Workers AI env');
		if (!ctx.moduleContext) throw new Error('project.propose-assignment requires a module context');

		const api = createProjectApi(ctx.moduleContext);
		const [{ tasks }, candidates] = await Promise.all([
			api.listTasks(input.projectId),
			api.listUsers()
		]);

		const result = await runStructuredOutput({
			task: 'project.propose-assignment',
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{
					role: 'user',
					content: `projectId: ${input.projectId}\nGoal: ${input.goal}\n\nTasks:\n${JSON.stringify(
						compactTasks(tasks)
					)}\n\nCandidates:\n${JSON.stringify(candidates)}\n\nReturn the proposal JSON.`
				}
			],
			schema: ProjectDraftActionSchema,
			schemaName: 'project.draft-action',
			schemaVersion: 'v1',
			modelHint: { capability: 'reasoning', priority: 'quality' },
			metadata: {
				tenantId: ctx.tenantId ?? 'default',
				userId: ctx.userId,
				capabilityId: 'project.propose-assignment',
				promptVersion: 'v1',
				schemaVersion: 'v1',
				riskLevel: 'R3'
			},
			env: ctx.env
		});
		if (result.status !== 'success') {
			throw new Error(`Assignment proposal failed (${result.status}).`);
		}
		return result.result.value;
	}
};
