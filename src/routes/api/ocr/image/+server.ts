import type { RequestHandler } from './$types';
import { fail, ok } from '$platform/http';
import { runImageDocumentOcr } from '$platform/ai/ocr/image-document-ocr';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function normalizeMime(m: string, fileName: string): string {
	const lower = (m.toLowerCase().split(';')[0] ?? '').trim();
	if (lower === 'image/jpg') return 'image/jpeg';
	if (ALLOWED_MIME.has(lower)) return lower;
	const n = fileName.toLowerCase();
	if (n.endsWith('.png')) return 'image/png';
	if (n.endsWith('.webp')) return 'image/webp';
	if (n.endsWith('.gif')) return 'image/gif';
	if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
	return '';
}

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) {
		return fail('Unauthorized', 401);
	}

	if (!platform?.env) {
		return fail('Platform unavailable', 503);
	}

	const ct = request.headers.get('content-type') ?? '';
	if (!ct.includes('multipart/form-data')) {
		return fail('Expected multipart/form-data with field "file"', 400);
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return fail('Invalid form data', 400);
	}

	const file = form.get('file');
	if (!(file instanceof File)) {
		return fail('Missing file field', 400);
	}

	const mime = normalizeMime(file.type, file.name);
	if (!mime || !ALLOWED_MIME.has(mime)) {
		return fail('Unsupported image type. Use JPEG, PNG, WebP, or GIF.', 415);
	}

	const buf = new Uint8Array(await file.arrayBuffer());
	const result = await runImageDocumentOcr(platform.env, {
		imageBytes: buf,
		mimeType: mime,
		fileName: file.name
	});

	if (!result.ok) {
		return fail(result.error, 502);
	}

	return ok({
		text: result.text,
		provider: result.provider,
		fileName: file.name
	});
};
