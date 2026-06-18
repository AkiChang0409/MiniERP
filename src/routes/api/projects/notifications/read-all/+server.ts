import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { createProjectApi } from '$modules/project';
import { fail, ok } from '$platform/http';

/** POST /api/projects/notifications/read-all — mark all of the user's as read. */
export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		return ok(await project.markAllNotificationsRead());
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
