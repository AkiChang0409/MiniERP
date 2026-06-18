import { createProjectApi } from '../../services/api';
import type { ProjectCapability } from '../types';
import {
	viewCalendarInputSchema,
	viewCalendarOutputSchema,
	type ViewCalendarInput,
	type ViewCalendarOutput
} from './schema';

/**
 * Read-only: project task execution calendar.
 *
 * Unlike the other project capabilities (LLM functions that read `ctx.env`),
 * this is a DATA-read capability: it forwards to the module facade
 * `createProjectApi(ctx.moduleContext).getCalendarEvents` (the blessed
 * facade-path, mirroring `hr.list-pending-leave`). This lets a project agent
 * read "what's happening this week" — the foundation for future operate-class
 * capabilities (e.g. reschedule) that re-plan around it.
 */
export const viewCalendarCapability: ProjectCapability<ViewCalendarInput, ViewCalendarOutput> = {
	id: 'project.view-calendar',
	description:
		'List project task execution events (start / due / overdue / under-review / blocked / milestone) in a date window, with optional project / assignee / stage / status / quick filters.',
	riskLevel: 'R1',
	inputSchema: viewCalendarInputSchema,
	outputSchema: viewCalendarOutputSchema,

	async execute(input, ctx) {
		if (!ctx.moduleContext) {
			throw new Error('project.view-calendar requires a moduleContext');
		}
		const project = createProjectApi(ctx.moduleContext);
		return project.getCalendarEvents(input);
	}
};
