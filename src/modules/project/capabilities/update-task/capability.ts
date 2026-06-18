import { createProjectApi } from '../../api';
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
		return createProjectApi(ctx.moduleContext).updateTask(input.taskId, input.projectId, input.patch);
	}
};
