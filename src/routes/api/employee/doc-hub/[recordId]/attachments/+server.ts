import type { RequestHandler } from './$types';

import {
	appendDocHubAttachments,
	removeDocHubAttachment,
	type DocHubUploadFile
} from '$platform/integrations/lark/doc-hub-library';

/**
 * Attachment mutations for a Doc Hub record.
 *
 * POST   (multipart, field `files`) — upload + append new attachment(s).
 * DELETE (?token=<file_token>)       — remove one attachment.
 *
 * PUBLIC (no login) — lives under the `/api/employee/doc-hub/*` bypass in
 * hooks.server.ts. SECURITY: anyone with the URL can modify the shared Bitable
 * record's files. This is an explicit product decision; gate with a session /
 * signed token if the documents become sensitive.
 */

/** ~20 MB Lark media upload cap (upload_all). */
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const POST: RequestHandler = async ({ request, params, platform }) => {
	const env = platform?.env;
	if (!env) return json({ ok: false, error: 'Cloudflare platform bindings are required' }, 500);

	const recordId = params.recordId;
	if (!recordId) return json({ ok: false, error: 'recordId is required' }, 400);

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return json({ ok: false, error: 'Expected multipart/form-data' }, 400);
	}

	const uploads: DocHubUploadFile[] = [];
	for (const entry of form.getAll('files')) {
		if (!(entry instanceof File)) continue;
		if (entry.size === 0) continue;
		if (entry.size > MAX_FILE_BYTES) {
			return json({ ok: false, error: `"${entry.name}" exceeds the 20 MB upload limit` }, 413);
		}
		uploads.push({
			name: entry.name || 'upload',
			mimeType: entry.type || 'application/octet-stream',
			bytes: new Uint8Array(await entry.arrayBuffer())
		});
	}

	if (uploads.length === 0) return json({ ok: false, error: 'No files provided' }, 400);

	try {
		const attachments = await appendDocHubAttachments(env, recordId, uploads);
		return json({ ok: true, attachments });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ ok: false, error: `Upload failed: ${message}` }, 502);
	}
};

export const DELETE: RequestHandler = async ({ url, params, platform }) => {
	const env = platform?.env;
	if (!env) return json({ ok: false, error: 'Cloudflare platform bindings are required' }, 500);

	const recordId = params.recordId;
	if (!recordId) return json({ ok: false, error: 'recordId is required' }, 400);

	const token = url.searchParams.get('token')?.trim();
	if (!token) return json({ ok: false, error: 'token is required' }, 400);

	try {
		const attachments = await removeDocHubAttachment(env, recordId, token);
		return json({ ok: true, attachments });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ ok: false, error: `Delete failed: ${message}` }, 502);
	}
};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}
