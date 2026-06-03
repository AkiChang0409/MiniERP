import type { RequestHandler } from './$types';

import { fail } from '$platform/http';
import { createDocumentIntakeService } from '$modules/document-intake';
import { getDb } from '../../../../../infrastructure/db';

const DIAGNOSTICS_ROLES = new Set(['owner', 'admin', 'finance']);
const MAX_BUFFER_BYTES = 32 * 1024 * 1024;

function asciiFileName(name: string): string {
	const cleaned = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
	return cleaned.slice(0, 180) || 'document';
}

export const GET: RequestHandler = async (event) => {
	if (!event.platform) return fail('Cloudflare platform bindings are required', 500);
	const user = event.locals.user;
	if (!user) return fail('Unauthorized', 401);
	if (!user.roles.some((r) => DIAGNOSTICS_ROLES.has(r))) {
		return fail('Forbidden — document preview is restricted to finance operators.', 403);
	}
	if (!event.platform.env.R2) return fail('R2 storage is not bound in this runtime.', 503);

	const id = event.params.id;
	if (!id) return fail('Document id is required', 400);

	const service = createDocumentIntakeService({
		db: getDb(event.platform.env),
		env: event.platform.env,
		user
	});
	const artifact = await service.getDocumentArtifact({ tenantId: 'default', documentId: id });
	if (!artifact) return fail('Document not found', 404);

	// `?variant=enhanced` serves the client-preprocessed vision-enhanced JPEG
	// (when present) instead of the original. Used for inline preview because
	// the original may be a format the browser can't render in <img> (e.g.
	// TIFF). Falls back to the original when there's no derived file.
	const wantEnhanced = event.url.searchParams.get('variant') === 'enhanced';
	const derived = artifact.originalFile.derived;
	const useDerived = wantEnhanced && !!derived;
	const storageRef = useDerived ? derived!.storageRef : artifact.originalFile.storageRef;
	const mimeType = useDerived ? derived!.mimeType : artifact.originalFile.mimeType;

	const object = await event.platform.env.R2.get(storageRef);
	if (!object) return fail('File not found in R2.', 404);

	const headers = new Headers();
	headers.set('Content-Type', mimeType || 'application/octet-stream');
	const disposition =
		event.url.searchParams.get('download') === '1' ||
		event.url.searchParams.get('attachment') === '1'
			? 'attachment'
			: 'inline';
	headers.set(
		'Content-Disposition',
		`${disposition}; filename="${asciiFileName(artifact.originalFile.fileName)}"`
	);
	headers.set('Cache-Control', 'private, max-age=300');
	if (object.httpEtag && /^[\x21\x23-\x7E]+$/.test(object.httpEtag)) {
		headers.set('etag', object.httpEtag);
	}

	const size = object.size;
	if (typeof size === 'number' && size === 0) {
		return new Response(null, { status: 204, headers });
	}
	if (typeof size !== 'number' || size <= MAX_BUFFER_BYTES) {
		const buf = await object.arrayBuffer();
		return new Response(buf, { headers });
	}
	return new Response(object.body, { headers });
};
