import { createProjectApi } from '../../api';
import { writeTaskToBitable } from '../../task-write-through';
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

const PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
type Priority = (typeof PRIORITIES)[number];
/** Coerce a change-set value to a valid priority, else undefined. */
function prio(value: unknown): Priority | undefined {
	const s = str(value)?.toUpperCase();
	return (PRIORITIES as readonly string[]).includes(s ?? '') ? (s as Priority) : undefined;
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
		const mc = ctx.moduleContext;
		const api = createProjectApi(mc);
		const applied: ApplyTaskChangeSetOutput['applied'] = [];

		for (const change of input.changes) {
			const after = (change.after ?? {}) as Record<string, unknown>;

			if (change.action === 'create') {
				const name = str(after.name);
				if (!name) {
					applied.push({ action: 'create', skipped: true });
					continue;
				}
				// Bitable-first (source of truth) + best-effort D1 mirror.
				const wt = await writeTaskToBitable(mc, {
					projectRef: input.projectId,
					values: {
						name,
						description: str(after.description) ?? null,
						startDate: str(after.startDate) ?? null,
						endDate: str(after.endDate) ?? null,
						status: 'unassigned',
						priority: prio(after.priority) ?? null
					},
					actorUserId: ctx.userId ?? null
				});
				let d1Id: string | null = null;
				try {
					const r = await api.createTask({
						projectId: input.projectId,
						name,
						description: str(after.description),
						startDate: str(after.startDate) ?? null,
						endDate: str(after.endDate) ?? null,
						assigneeId: str(after.assigneeId) ?? str(after.assignee) ?? null,
						priority: prio(after.priority) ?? null
					});
					d1Id = r.id;
					if (wt.recordId) await api.setTaskBitableRecordId(r.id, wt.recordId);
				} catch {
					/* project not in D1 — Bitable is the source of truth */
				}
				const newId = d1Id ?? wt.recordId;
				applied.push(newId ? { action: 'create', id: newId } : { action: 'create', skipped: true });
				continue;
			}

			if (change.action === 'update' || change.action === 'reschedule' || change.action === 'assign') {
				const taskId = change.taskId ?? str(after.taskId);
				if (!taskId) {
					applied.push({ action: change.action, skipped: true });
					continue;
				}
				let recId: string | null = /^rec[A-Za-z0-9]+$/.test(taskId) ? taskId : null;
				try {
					await api.updateTask(taskId, input.projectId, {
						name: str(after.name),
						startDate: 'startDate' in after ? (str(after.startDate) ?? null) : undefined,
						endDate: 'endDate' in after ? (str(after.endDate) ?? null) : undefined,
						assigneeId:
							'assigneeId' in after || 'assignee' in after
								? (str(after.assigneeId) ?? str(after.assignee) ?? null)
								: undefined,
						priority: 'priority' in after ? (prio(after.priority) ?? null) : undefined,
						rescheduleReason: change.reason
					});
					if (!recId) recId = await api.getTaskBitableRecordId(input.projectId, taskId);
				} catch {
					/* not a D1-native task — taskId is a Bitable record id */
				}
				if (recId) {
					await writeTaskToBitable(mc, {
						recordId: recId,
						projectRef: input.projectId,
						values: {
							name: str(after.name) ?? null,
							startDate: 'startDate' in after ? (str(after.startDate) ?? null) : null,
							endDate: 'endDate' in after ? (str(after.endDate) ?? null) : null,
							priority: 'priority' in after ? (prio(after.priority) ?? null) : null
						},
						actorUserId: ctx.userId ?? null
					});
				}
				applied.push({ action: change.action, taskId });
				continue;
			}

			// 'notify' has no service method yet — record as skipped (plan Step 3).
			applied.push({ action: change.action, taskId: change.taskId, skipped: true });
		}

		return { applied };
	}
};
