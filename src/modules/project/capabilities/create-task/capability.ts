import { createProjectApi } from '../../api';
import { writeTaskToBitable } from '../../task-write-through';
import type { ProjectCapability } from '../types';
import {
	CreateTaskInputSchema,
	CreateTaskOutputSchema,
	type CreateTaskInput,
	type CreateTaskOutput
} from './schema';

/**
 * R4 governed write (plan Phase 8): create a project task. Forwards to the
 * project api facade (`createProjectApi(ctx).createTask`) — business truth +
 * permission checks (assertCanEdit) stay in the service. Registered with
 * `sideEffect: 'write'` + `requiresConfirmation: true`, so the governed runtime
 * denies it without a confirmationRef. Applies a confirmed `propose-task-plan`
 * draft (plan Phase 7) one change at a time.
 */
export const createTaskCapability: ProjectCapability<CreateTaskInput, CreateTaskOutput> = {
	id: 'project.create-task',
	description: 'Create a single project task. Requires confirmation; persists to the project.',
	riskLevel: 'R4',
	inputSchema: CreateTaskInputSchema,
	outputSchema: CreateTaskOutputSchema,

	async execute(input, ctx): Promise<CreateTaskOutput> {
		if (!ctx.moduleContext) throw new Error('project.create-task requires a module context');
		const mc = ctx.moduleContext;

		// Bitable-first (source of truth): projects/tasks live in the Lark Base, so
		// the record id from `project.list-projects` is a Bitable Projects id.
		const wt = await writeTaskToBitable(mc, {
			projectRef: input.projectId,
			values: {
				name: input.name,
				description: input.description ?? null,
				startDate: input.startDate ?? null,
				endDate: input.endDate ?? null,
				status: 'unassigned',
				priority: input.priority ?? null
			},
			actorUserId: ctx.userId ?? null
		});

		// Best-effort D1 mirror for the legacy task engine — only succeeds for a
		// D1-native project; a Bitable-only project just skips it.
		let d1Id: string | null = null;
		try {
			const r = await createProjectApi(mc).createTask(input);
			d1Id = r.id;
			if (wt.recordId) await createProjectApi(mc).setTaskBitableRecordId(r.id, wt.recordId);
		} catch {
			/* project not in D1 — Bitable is the source of truth for this task */
		}

		const id = d1Id ?? wt.recordId;
		if (!id) throw new Error(`Task not created: ${wt.error ?? 'unknown error'}`);
		return { id };
	}
};
