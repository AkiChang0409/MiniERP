import type { RequestHandler } from './$types';

import { fail, ok } from '$platform/http';
import {
	createDocumentIntakeService,
	type DocumentProcessorMessage
} from '$modules/document-intake';

/**
 * Manual upload endpoint (Ship 2 — async inbox pipeline).
 *
 * Flow:
 *  1. Validate auth + multipart input.
 *  2. Store the file (via FileService → R2) and create the artifact row in
 *     `stored` state. Synchronous — the caller needs the documentId back to
 *     poll/inbox-render.
 *  3. Push a `DocumentProcessorMessage` onto the async queue and return 202
 *     with the artifact view. The queue consumer
 *     (workers/document-processor.ts) runs extract → classify → field-extract
 *     and lands the artifact in `ready_for_review`.
 *
 * Dev fallback: local wrangler queue producer/consumer processes do not
 * reliably share messages. On localhost (or when DOCUMENT_PROCESS_INLINE=true),
 * run the pipeline inline so UI development doesn't strand artifacts in
 * `stored`. Production still uses DOCUMENT_QUEUE unless queue send fails.
 *
 * Request fields (multipart/form-data):
 *  - `file` (required): the document binary
 *  - `uploadedFrom` (optional): `ai_panel` | `finance_workspace` | `task_mode`
 *  - `clientExtractedText` (optional): browser pdfjs output, lets the worker
 *    skip server-side extraction
 *  - `clientExtractionMethod` (optional): `pdfjs` | `vision_first_page` |
 *    `manual` — provenance hint stored in audit metadata
 */
export const POST: RequestHandler = async (event) => {
	if (!event.platform) return fail('Cloudflare platform bindings are required', 500);
	const user = event.locals.user;
	if (!user) return fail('Unauthorized', 401);

	let form: FormData;
	try {
		form = await event.request.formData();
	} catch {
		return fail('Expected multipart/form-data with a `file` field', 400);
	}

	const file = form.get('file');
	if (!(file instanceof File)) {
		return fail('Missing required field: file', 400);
	}
	const uploadedFromRaw = form.get('uploadedFrom');
	const uploadedFrom =
		uploadedFromRaw === 'finance_workspace' || uploadedFromRaw === 'task_mode'
			? uploadedFromRaw
			: 'ai_panel';

	// Ship 1: client may pre-extract PDF text via browser pdfjs and pass it
	// here so the server can skip its broken byte heuristic. The text is
	// forwarded verbatim into the queue message; the worker uses it.
	const clientExtractedTextRaw = form.get('clientExtractedText');
	const clientExtractionMethodRaw = form.get('clientExtractionMethod');
	const clientExtractedText =
		typeof clientExtractedTextRaw === 'string' && clientExtractedTextRaw.trim().length > 0
			? clientExtractedTextRaw
			: undefined;
	const clientExtractionMethod =
		clientExtractionMethodRaw === 'pdfjs' ||
		clientExtractionMethodRaw === 'vision_first_page' ||
		clientExtractionMethodRaw === 'manual'
			? clientExtractionMethodRaw
			: undefined;

	const env = event.platform.env;
	const tenantId = 'default';
	const service = createDocumentIntakeService({
		db: (await import('../../../infrastructure/db')).getDb(env),
		env,
		user
	});

	let artifact;
	try {
		const body = new Uint8Array(await file.arrayBuffer());
		artifact = await service.createDocumentFromUpload({
			tenantId,
			uploadedBy: user.id,
			uploadedFrom,
			fileName: file.name,
			mimeType: file.type || 'application/octet-stream',
			body,
			sizeBytes: body.byteLength
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Upload failed';
		return fail(message, 400);
	}

	const message: DocumentProcessorMessage = {
		v: 1,
		documentId: artifact.id,
		tenantId,
		userId: user.id,
		userEmail: user.email,
		clientExtractedText,
		clientExtractionMethod
	};

	if (shouldProcessInlineForDev(event)) {
		return await processInlineFallback(service, message, env, 201);
	}

	if (env.DOCUMENT_QUEUE) {
		try {
			await env.DOCUMENT_QUEUE.send(message);
		} catch (err) {
			// Queue push failed — fall through to inline processing so the
			// upload doesn't get stuck. The artifact row already exists.
			console.error('[POST /api/documents] queue send failed, falling back to inline:', err);
			return await processInlineFallback(service, message, env, 201);
		}
		// 202 Accepted — pipeline is running asynchronously. The caller polls
		// GET /api/documents/[id]/status (or the /finance/inbox page) for
		// the eventual `ready_for_review` view.
		return ok(service.toView(artifact), 202);
	}

	// Dev / local fallback: no queue binding.
	return await processInlineFallback(service, message, env, 201);
};

function shouldProcessInlineForDev(event: Parameters<RequestHandler>[0]): boolean {
	const env = event.platform?.env as (Env & {
		DOCUMENT_PROCESS_INLINE?: string;
		DOCUMENT_QUEUE_FORCE_ASYNC?: string;
	}) | undefined;
	if (env?.DOCUMENT_QUEUE_FORCE_ASYNC === 'true') return false;
	if (env?.DOCUMENT_PROCESS_INLINE === 'true') return true;

	// Wrangler local queue producer/consumer dev servers do not reliably share
	// messages across separate processes. Keep localhost uploads usable by
	// processing inline; deployed workers still use the queue.
	const host = event.url.hostname;
	return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
}

async function processInlineFallback(
	service: ReturnType<typeof createDocumentIntakeService>,
	message: DocumentProcessorMessage,
	env: Env,
	status = 201
) {
	// Lazy-load finance bits only on the inline path so the typical
	// queue-driven prod path doesn't pull them into the HTTP worker bundle.
	const {
		extractDocumentFieldsCapability,
		categoryIdForDocumentType
	} = await import('$modules/finance');

	try {
		const processed = await service.processDocument({
			tenantId: message.tenantId,
			documentId: message.documentId,
			clientExtractedText: message.clientExtractedText,
			clientExtractionMethod: message.clientExtractionMethod,
			fieldExtractor: async ({
				tenantId,
				documentId,
				fileName,
				text,
				documentType,
				classificationConfidence
			}) => {
				const categoryId = categoryIdForDocumentType(documentType ?? 'unknown');
				if (!categoryId) return null;
				if (classificationConfidence < 0.4) return null;

				const result = await extractDocumentFieldsCapability.execute(
					{ documentId, fileName, text, categoryId, artifactConfidence: classificationConfidence },
					{ tenantId, userId: message.userId, env, useMock: !env.AI }
				);
				return {
					fields: result.fields as unknown as Record<string, unknown>,
					confidence: result.fieldConfidence,
					evidence: result.evidence,
					sourceQuotes: result.sourceQuotes,
					categoryId
				};
			}
		});
		return ok(service.toView(processed), status);
	} catch (err) {
		const message2 = err instanceof Error ? err.message : 'Processing failed';
		return fail(message2, 500, { documentId: message.documentId });
	}
}
