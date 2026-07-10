import { createProjectApi } from '../../api';
import { syncTaskToBitable } from '../../task-write-through';
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
		const result = await createProjectApi(ctx.moduleContext).createTask(input);
		// Bitable write-through (B4) — best-effort, never breaks the D1 create.
		await syncTaskToBitable(ctx.moduleContext, {
			taskId: result.id,
			projectId: input.projectId,
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
		return result;
	}
};
