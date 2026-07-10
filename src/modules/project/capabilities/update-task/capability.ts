import { createProjectApi } from '../../api';
import { writeTaskToBitable } from '../../task-write-through';
import type { ProjectCapability } from '../types';
import {
	UpdateTaskInputSchema,
	UpdateTaskOutputSchema,
	type UpdateTaskInput,
	type UpdateTaskOutput
} from './schema';

/**
 * R4 governed write (plan Phase 8): update a project task — including reschedule
 * (start/end dates + reason) and assignment (assigneeId). Forwards to
 * `createProjectApi(ctx).updateTask`; permission + schedule-change audit stay in
 * the service. Registered `sideEffect: 'write'` + `requiresConfirmation: true`.
 * Applies a confirmed `propose-reschedule` / `propose-assignment` draft (plan
 * Phase 7) one change at a time.
 */
export const updateTaskCapability: ProjectCapability<UpdateTaskInput, UpdateTaskOutput> = {
	id: 'project.update-task',
	description:
		'Update a project task (reschedule dates, reassign, edit fields). Requires confirmation; persists to the project.',
	riskLevel: 'R4',
	inputSchema: UpdateTaskInputSchema,
	outputSchema: UpdateTaskOutputSchema,

	async execute(input, ctx): Promise<UpdateTaskOutput> {
		if (!ctx.moduleContext) throw new Error('project.update-task requires a module context');
		const mc = ctx.moduleContext;

		// Best-effort D1 update (succeeds only for a D1-native task id).
		let d1Ok = false;
		let bitableRecordId: string | null = /^rec[A-Za-z0-9]+$/.test(input.taskId) ? input.taskId : null;
		try {
			await createProjectApi(mc).updateTask(input.taskId, input.projectId, input.patch);
			d1Ok = true;
			if (!bitableRecordId) {
				bitableRecordId = await createProjectApi(mc).getTaskBitableRecordId(
					input.projectId,
					input.taskId
				);
			}
		} catch {
			/* not a D1-native task — the taskId is (or should be) a Bitable record id */
		}

		// Bitable-first update on the linked record (source of truth).
		let bitableOk = false;
		if (bitableRecordId) {
			const wt = await writeTaskToBitable(mc, {
				recordId: bitableRecordId,
				projectRef: input.projectId,
				values: {
					name: input.patch.name ?? null,
					description: input.patch.description ?? null,
					startDate: input.patch.startDate ?? null,
					endDate: input.patch.endDate ?? null,
					progressPct: input.patch.progressPct ?? null,
					priority: input.patch.priority ?? null
				},
				actorUserId: ctx.userId ?? null
			});
			bitableOk = !wt.error;
		}

		if (!d1Ok && !bitableOk) throw new Error('Task not updated: no matching D1 or Bitable record.');
		return { id: bitableRecordId ?? input.taskId };
	}
};
