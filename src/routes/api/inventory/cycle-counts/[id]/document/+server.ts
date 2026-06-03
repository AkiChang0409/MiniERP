/**
 * INV003 — Stream a cycle count's signed physical-count document from R2.
 *
 * Cycle counts store the doc as `r2:<key>` in `inventoryCycleCounts.documentRef`.
 * Plain-text refs (legacy / out-of-system PDFs) are not served here — caller
 * just renders the string. We never expose R2 keys to the browser; everything
 * goes through this URL.
 */
import type { RequestHandler } from './$types';
import { createInventoryApi } from '$modules/inventory';
import { createModuleContext } from '$platform/modules';
import { fail } from '$platform/http';

export const GET: RequestHandler = async (event) => {
	if (!event.platform) return fail('Cloudflare bindings missing', 500);
	const ctx = await createModuleContext(event);
	const inventory = createInventoryApi(ctx);
	const id = event.params.id!;
	let detail;
	try {
		detail = await inventory.getCycleCountDetail(id);
	} catch (err) {
		return fail((err as Error).message, 404);
	}
	const ref = detail.session.documentRef;
	if (!ref || !ref.startsWith('r2:')) {
		return fail('No uploaded signed document on this cycle count.', 404);
	}
	const key = ref.slice('r2:'.length);
	const object = await event.platform.env.R2.get(key);
	if (!object) return fail('Stored document is missing from R2.', 410);

	const headers = new Headers();
	const contentType = object.httpMetadata?.contentType ?? 'application/octet-stream';
	headers.set('content-type', contentType);
	const disposition = event.url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
	const fallbackName = key.split('/').pop() ?? 'cycle-count-document';
	headers.set('content-disposition', `${disposition}; filename="${fallbackName}"`);
	if (object.size) headers.set('content-length', String(object.size));
	headers.set('cache-control', 'private, max-age=60');
	return new Response(object.body, { status: 200, headers });
};
