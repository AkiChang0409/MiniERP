import type { RequestHandler } from './$types';

import { bitableDownloadMedia } from '$platform/integrations/lark/bitable';
import { docHubTableId } from '$platform/integrations/lark/doc-hub-library';

/**
 * Stream a single Doc Hub attachment from Lark Drive.
 *
 * Lives under `/api/employee/*` (not `/api/doc-hub/*`) on purpose: the latter is
 * gated to the `document-intake` module, which self-service employees don't
 * have. This path is only session-gated (see hooks.server.ts) so any signed-in
 * user reaching My Space can preview/download their Doc Hub files.
 *
 * Query params:
 *   token    — Bitable attachment file_token (required)
 *   rev      — owning table revision (recommended; Bitable-owned media 400s
 *              without the perm `extra` param — see bitableDownloadMedia)
 *   name     — original filename (used for Content-Disposition)
 *   download — "1" forces a download instead of inline preview
 */
export const GET: RequestHandler = async ({ url, platform }) => {
	const env = platform?.env;
	if (!env) return new Response('Cloudflare platform bindings are required', { status: 500 });

	const token = url.searchParams.get('token')?.trim();
	if (!token) return new Response('token is required', { status: 400 });

	const revRaw = url.searchParams.get('rev');
	const rev = revRaw != null && revRaw !== '' ? Number(revRaw) : NaN;
	const perm = Number.isFinite(rev) ? { tableId: docHubTableId(env), rev } : undefined;

	const rawName = url.searchParams.get('name')?.trim() || 'attachment';
	// Strip control/quote chars that would break the header; keep it ASCII-safe
	// and also provide the UTF-8 filename* form for non-ASCII names.
	const safeName = rawName.replace(/["\\\r\n]/g, '_');
	const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';

	let media: { bytes: Uint8Array; mimeType: string };
	try {
		media = await bitableDownloadMedia(env, token, perm);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return new Response(`Attachment download failed: ${message}`, { status: 502 });
	}

	return new Response(media.bytes as unknown as BodyInit, {
		headers: {
			'Content-Type': media.mimeType || 'application/octet-stream',
			'Content-Disposition': `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(
				rawName
			)}`,
			'Content-Length': String(media.bytes.byteLength),
			'Cache-Control': 'private, max-age=300',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
