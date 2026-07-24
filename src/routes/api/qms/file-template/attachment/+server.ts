import type { RequestHandler } from './$types';

import { bitableDownloadMedia } from '$platform/integrations/lark/bitable';
import { fileTemplateTableId } from '$platform/integrations/lark/file-template-library';

/**
 * Stream a single File Template attachment (the blank ISO 9001 template file)
 * from Lark Drive. Mirrors the Doc Hub attachment route: the owning table id for
 * the media-download perm is resolved server-side (never trusted from the
 * client); only token / rev / name come from the query.
 *
 * Query params:
 *   token    — Bitable attachment file_token (required)
 *   rev      — owning table revision (Bitable-owned media 400s without the perm)
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
	const perm = Number.isFinite(rev) ? { tableId: fileTemplateTableId(), rev } : undefined;

	const rawName = url.searchParams.get('name')?.trim() || 'template';
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
