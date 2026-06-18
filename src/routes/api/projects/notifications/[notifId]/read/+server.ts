import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { createProjectApi } from '$modules/project';
import { fail, ok } from '$platform/http';

/** POST /api/projects/notifications/[notifId]/read — mark one notification read. */
export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		return ok(await project.markNotificationRead(event.params.notifId));
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
