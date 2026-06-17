import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createModuleContext } from '$platform/modules';
import { ProjectQmsService } from '$modules/project';
import { ProjectPermissionError } from '$modules/project';
import { NotFoundError } from '$platform/modules/errors';

/**
 * Personal task-detail page — the assignee's view of a single task: title,
 * project, dates, description, the ISO records to fill (template download +
 * notes), and a submit/complete action. Works for tasks with or without ISO
 * records.
 */
export const load: PageServerLoad = async (event) => {
	const userId = event.locals.user?.id ?? null;
	if (!event.platform || !userId) {
		throw error(401, 'Sign in to view this task.');
	}
	const ctx = await createModuleContext(event);
	const svc = new ProjectQmsService(ctx);
	try {
		const detail = await svc.getTaskDetail(event.params.taskId, userId);
		return detail;
	} catch (e) {
		if (e instanceof NotFoundError) throw error(404, 'Task not found.');
		if (e instanceof ProjectPermissionError) throw error(403, e.message);
		throw e;
	}
};
