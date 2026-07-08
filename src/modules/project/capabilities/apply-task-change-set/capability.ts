import { createProjectApi } from '../../api';
import type { ProjectCapability } from '../types';
import {
	ApplyTaskChangeSetInputSchema,
	ApplyTaskChangeSetOutputSchema,
	type ApplyTaskChangeSetInput,
	type ApplyTaskChangeSetOutput
} from './schema';

/**
 * R4 governed write (plan Step 1): apply a confirmed `ProjectDraftAction` change
 * set. Each change forwards to the project api facade (createTask / updateTask);
 * business truth + permission checks stay in the service. Registered with
 * `sideEffect: 'write'` + `requiresConfirmation: true`, so the governed runtime
 * denies it without a confirmationRef — the orchestrator supplies the payload
 * hash of the confirmed changes. This is the "apply" end of the write loop; the
 * `propose-*` drafts are the "propose" end.
 */
function str(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export const applyTaskChangeSetCapability: ProjectCapability<
	ApplyTaskChangeSetInput,
	ApplyTaskChangeSetOutput
> = {
	id: 'project.apply-task-change-set',
	description:
		'Apply a confirmed set of project task changes (create / update / reschedule / assign). Requires confirmation; persists to the project.',
	riskLevel: 'R4',
	inputSchema: ApplyTaskChangeSetInputSchema,
	outputSchema: ApplyTaskChangeSetOutputSchema,

	async execute(input, ctx): Promise<ApplyTaskChangeSetOutput> {
		if (!ctx.moduleContext) throw new Error('project.apply-task-change-set requires a module context');
		const api = createProjectApi(ctx.moduleContext);
		const applied: ApplyTaskChangeSetOutput['applied'] = [];

		for (const change of input.changes) {
			const after = (change.after ?? {}) as Record<string, unknown>;

			if (change.action === 'create') {
				const name = str(after.name);
				if (!name) {
					applied.push({ action: 'create', skipped: true });
					continue;
				}
				const created = await api.createTask({
					projectId: input.projectId,
					name,
					description: str(after.description),
					startDate: str(after.startDate) ?? null,
					endDate: str(after.endDate) ?? null,
					assigneeId: str(after.assigneeId) ?? str(after.assignee) ?? null
				});
				applied.push({ action: 'create', id: created.id });
				continue;
			}

			if (change.action === 'update' || change.action === 'reschedule' || change.action === 'assign') {
				const taskId = change.taskId ?? str(after.taskId);
				if (!taskId) {
					applied.push({ action: change.action, skipped: true });
					continue;
				}
				await api.updateTask(taskId, input.projectId, {
					name: str(after.name),
					startDate: 'startDate' in after ? (str(after.startDate) ?? null) : undefined,
					endDate: 'endDate' in after ? (str(after.endDate) ?? null) : undefined,
					assigneeId:
						'assigneeId' in after || 'assignee' in after
							? (str(after.assigneeId) ?? str(after.assignee) ?? null)
							: undefined,
					rescheduleReason: change.reason
				});
				applied.push({ action: change.action, taskId });
				continue;
			}

			// 'notify' has no service method yet — record as skipped (plan Step 3).
			applied.push({ action: change.action, taskId: change.taskId, skipped: true });
		}

		return { applied };
	}
};
