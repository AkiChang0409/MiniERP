import type { RequestHandler } from './$types';

import {
	createProjectApi,
	ProjectPermissionError
} from '$modules/project';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import { fail, ok } from '$platform/http';

/**
 * TKMGMT1 v2 — soft-delete a single attachment row.
 *
 *   DELETE /api/projects/[id]/attachments/[attachmentId]
 *
 * If `attachmentId` is the magic `__legacy__` sentinel, clear the legacy
 * `attachment_url` / `attachment_name` columns instead. The R2 object is
 * intentionally left behind; a future retention sweep handles physical
 * cleanup (see BaseLine §3.6 `abandonIntake` pattern).
 */
export const DELETE: RequestHandler = async (event) => {
	if (!event.platform) {
		return fail('Cloudflare platform bindings are required', 500);
	}
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);

		if (event.params.attachmentId === '__legacy__') {
			const result = await project.clearLegacyAttachment(event.params.id);
			return ok({ removed: result.removed, legacy: true });
		}

		const result = await project.removeAttachment(
			event.params.id,
			event.params.attachmentId
		);
		return ok({ removed: result.removed, legacy: false });
	} catch (e) {
		if (e instanceof ProjectPermissionError) return fail(e.message, 403);
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
