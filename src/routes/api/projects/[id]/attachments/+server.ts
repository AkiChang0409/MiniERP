import type { RequestHandler } from './$types';

import {
	createProjectApi,
	ProjectPermissionError,
	ProjectValidationError
} from '$modules/project';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import { fail, ok } from '$platform/http';
import { r2FileUrls } from '$platform/files/r2-file-urls';

// Keep this list aligned with the create-form server action.
const ALLOWED_EXT = new Set([
	'pdf',
	'doc',
	'docx',
	'xls',
	'xlsx',
	'png',
	'jpg',
	'jpeg'
]);
const ALLOWED_MIME = new Set([
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'image/png',
	'image/jpeg',
	'image/jpg'
]);
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

function sanitizeFileName(name: string): string {
	const base = name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
	return base || 'attachment';
}

function extOf(name: string): string {
	const m = /\.([a-zA-Z0-9]+)$/.exec(name);
	return m ? m[1].toLowerCase() : '';
}

function validateAttachment(file: File): { ok: true } | { ok: false; message: string } {
	if (file.size === 0) return { ok: false, message: 'Attachment file is empty.' };
	if (file.size > MAX_ATTACHMENT_BYTES) {
		return {
			ok: false,
			message: `Attachment is too large (${Math.round(file.size / 1024 / 1024)}MB > 15MB).`
		};
	}
	const ext = extOf(file.name);
	const mime = (file.type || '').toLowerCase();
	if (!ALLOWED_EXT.has(ext) && !ALLOWED_MIME.has(mime)) {
		return {
			ok: false,
			message: `Unsupported file type "${ext || mime || 'unknown'}". Allowed: ${[...ALLOWED_EXT].join(', ')}.`
		};
	}
	return { ok: true };
}

/**
 * TKMGMT1 v2 — multi-file attachments.
 *
 *   GET   /api/projects/[id]/attachments
 *   POST  /api/projects/[id]/attachments    multipart, field "files" (repeatable)
 */
export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const attachments = await project.listAttachments(event.params.id);
		return ok({ attachments });
	} catch (e) {
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};

export const POST: RequestHandler = async (event) => {
	if (!event.platform) {
		return fail('Cloudflare platform bindings are required', 500);
	}
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);

		// Confirm caller can edit. The service does this too (defense in depth),
		// but failing fast here also avoids touching R2 for nothing.
		const scope = await project.getEditableScope(event.params.id);
		if (scope === 'none') {
			return fail(
				'Only the owner, a manager, or a collaborator can upload attachments.',
				403
			);
		}

		const form = await event.request.formData();
		const raw = form.getAll('files');
		const files: File[] = raw.filter((v): v is File => v instanceof File && v.size > 0);
		if (files.length === 0) {
			return fail('No files received (form field "files" was empty).', 400);
		}

		const stored: Array<Awaited<ReturnType<typeof project.addAttachment>>> = [];
		const failures: Array<{ fileName: string; message: string }> = [];
		const datePart = new Date().toISOString().slice(0, 10);

		for (const file of files) {
			const verdict = validateAttachment(file);
			if (!verdict.ok) {
				failures.push({ fileName: file.name, message: verdict.message });
				continue;
			}
			const safeName = sanitizeFileName(file.name);
			const key = `projects/${event.params.id}/attachments/${datePart}/${crypto.randomUUID()}-${safeName}`;
			try {
				await event.platform.env.R2.put(key, await file.arrayBuffer(), {
					httpMetadata: { contentType: file.type || 'application/octet-stream' },
					customMetadata: {
						projectId: event.params.id,
						originalName: file.name,
						uploadedBy: ctx.user?.id ?? 'unknown'
					}
				});
				const { fileViewUrl } = r2FileUrls(key);
				const row = await project.addAttachment({
					projectId: event.params.id,
					storageKey: key,
					url: fileViewUrl ?? '',
					fileName: file.name,
					contentType: file.type || null,
					sizeBytes: file.size
				});
				stored.push(row);
			} catch (e) {
				failures.push({ fileName: file.name, message: (e as Error).message });
			}
		}

		return ok(
			{
				uploaded: stored,
				failed: failures
			},
			201
		);
	} catch (e) {
		if (e instanceof ProjectValidationError) {
			return fail(e.message + ': ' + Object.values(e.fields).join('; '), 400);
		}
		if (e instanceof ProjectPermissionError) return fail(e.message, 403);
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
