import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { createProjectApi } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * Tiny directory endpoint used by the collaborator picker on the project
 * create / edit page. Returns `{users:[{id,email,name}]}` either filtered by
 * `?q=` prefix or the first ~50 users when no prefix is given.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const q = event.url.searchParams.get('q')?.trim() ?? '';
		const users = q ? await project.searchUsers(q) : await project.listUsers();
		return ok({ users });
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
