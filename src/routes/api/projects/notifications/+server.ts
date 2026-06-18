import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { createProjectApi } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * GET /api/projects/notifications?unread=1
 *
 * Current user's in-app feed. Overdue notifications are materialised lazily on
 * read (no cron yet). Returns { items, unreadCount }.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const unreadOnly = event.url.searchParams.get('unread') === '1';
		const data = await project.listNotifications({ unreadOnly });
		return ok(data);
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
