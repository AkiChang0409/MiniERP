import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import { createProjectApi, ProjectPermissionError, ProjectValidationError } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * PATCH /api/projects/[id]/records/[recordId]
 *   body: { action: 'submit' | 'approve' | 'reject' | 'waive' | 'update', ... }
 *
 *   - submit  : responsible person (or manager/owner) marks the record done
 *   - approve : manager/owner signs off  → may complete the task
 *   - reject  : manager/owner sends back → task reopens for resubmission
 *   - waive   : manager excuses the record from the gate
 *   - update  : edit responsibleUserId / isRequired / fields / file metadata
 *
 * Record status transitions cascade to the owning task via the QMS gate.
 */
export const PATCH: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const projectId = event.params.id;
		const recordId = event.params.recordId;
		const body = (await event.request.json()) as Record<string, unknown>;
		const action = String(body.action ?? '');

		let result;
		switch (action) {
			case 'submit':
				result = await project.submitRecord(
					projectId,
					recordId,
					body.fields === undefined ? undefined : body.fields == null ? null : String(body.fields)
				);
				break;
			case 'approve':
				result = await project.approveRecord(projectId, recordId);
				break;
			case 'reject':
				result = await project.rejectRecord(
					projectId,
					recordId,
					body.reason == null ? null : String(body.reason)
				);
				break;
			case 'waive':
				result = await project.waiveRecord(
					projectId,
					recordId,
					body.reason == null ? null : String(body.reason)
				);
				break;
			case 'update':
				result = await project.updateRecord(projectId, recordId, {
					responsibleUserId:
						body.responsibleUserId === undefined
							? undefined
							: body.responsibleUserId == null
								? null
								: String(body.responsibleUserId),
					isRequired: body.isRequired === undefined ? undefined : Boolean(body.isRequired),
					fields: body.fields === undefined ? undefined : body.fields == null ? null : String(body.fields),
					fileUrl: body.fileUrl === undefined ? undefined : body.fileUrl == null ? null : String(body.fileUrl),
					storageKey:
						body.storageKey === undefined ? undefined : body.storageKey == null ? null : String(body.storageKey),
					fileName: body.fileName === undefined ? undefined : body.fileName == null ? null : String(body.fileName)
				});
				break;
			default:
				return fail(`Unknown action "${action}".`, 400);
		}
		return ok(result);
	} catch (e) {
		if (e instanceof ProjectValidationError) {
			return fail(e.message + ': ' + Object.values(e.fields).join('; '), 400);
		}
		if (e instanceof ProjectPermissionError) return fail(e.message, 403);
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
