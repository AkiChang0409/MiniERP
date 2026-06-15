import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { ProjectNotificationService } from '$modules/project';
import { fail, ok } from '$platform/http';

/** POST /api/projects/notifications/read-all — mark all of the user's as read. */
export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const svc = new ProjectNotificationService(ctx);
		return ok(await svc.markAllRead());
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
