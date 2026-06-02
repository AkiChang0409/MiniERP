import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { createProjectApi } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * TKMGMT1 / TKMGMT2 — remove a collaborator. Owner/manager only.
 */
export const DELETE: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);

		const scope = await project.getEditableScope(event.params.id);
		if (scope !== 'owner' && scope !== 'manager') {
			return fail(
				'Only the project owner or a manager may remove collaborators.',
				403
			);
		}

		const removed = await project.removeCollaborator(event.params.id, event.params.userId);
		return ok({ removed });
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
