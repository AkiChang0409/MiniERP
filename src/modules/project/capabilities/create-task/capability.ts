import { createProjectApi } from '../../api';
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
		return createProjectApi(ctx.moduleContext).createTask(input);
	}
};
