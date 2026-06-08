/**
 * Document processor worker (Ship 2A — async inbox pipeline).
 *
 * Consumes messages from `smartfin-doc-processor-queue` and runs the full
 * document-intake pipeline asynchronously:
 *   1. Text extraction (server side; client-extracted text already saved
 *      pre-queue when present)
 *   2. Classification
 *   3. Field extraction (finance-aware, branched by classifier-emitted
 *      documentType → categoryId mapping)
 *   4. Status → `ready_for_review`
 *
 * Why a separate worker (not in the SvelteKit fetch worker):
 *  - Queue handlers are long-running; isolating them keeps HTTP latency budget
 *    independent.
 *  - Concurrency, batch size, retry, and DLQ are configured per worker and
 *    we want fine-grained control here (max_concurrency=2, max_batch_size=1,
 *    max_retries=3) without affecting the public HTTP worker.
 *
 * Module boundary:
 *  - This worker is composition-root level — it is allowed to import both
 *    `document-intake` and `finance` modules. Inside the modules the
 *    boundary is preserved via inversion of control: `processDocument`
 *    accepts a `fieldExtractor` callback so document-intake never imports
 *    finance.
 *
 * Deploy: see `workers/wrangler.document-processor.jsonc`.
 *
 * The producer side (POST /api/documents) lives in the SvelteKit worker and
 * pushes via the shared `DOCUMENT_QUEUE` binding declared in the root
 * `wrangler.jsonc`.
 */

import {
	createDocumentIntakeService,
	type DocumentProcessorMessage
} from '../src/modules/document-intake';
import {
	extractDocumentFieldsCapability,
	classifyDocumentCategoryCapability,
	categoryIdForDocumentType,
	documentTypeForCategory,
	buildVisionFieldExtractionPrompt
} from '../src/modules/finance';
import { getDb } from '../src/infrastructure/db';

export type { DocumentProcessorMessage };


export default {
	async queue(
		batch: MessageBatch<DocumentProcessorMessage>,
		env: Env
	): Promise<void> {
		// max_batch_size=1 keeps this loop trivial; we still iterate so a future
		// bump to batch>1 doesn't require a code change.
		for (const msg of batch.messages) {
			const payload = msg.body;
			if (payload?.v !== 1) {
				// Unknown schema — ack and drop. Cloudflare retries don't help
				// when the message itself is malformed.
				console.warn(
					`[document-processor] dropping unknown message schema: ${JSON.stringify(payload).slice(0, 200)}`
				);
				msg.ack();
				continue;
			}

			try {
				await processOne(payload, env);
				msg.ack();
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				console.error(
					`[document-processor] failed for documentId=${payload.documentId}: ${message}`
				);
				// retry() lets Cloudflare requeue with backoff up to max_retries,
				// after which the message lands in the configured DLQ.
				msg.retry();
			}
		}
	}
};

async function processOne(
	payload: DocumentProcessorMessage,
	env: Env
): Promise<void> {
	const db = getDb(env);
	const service = createDocumentIntakeService({
		db,
		env,
		// No `user` here — the queue runs system-side. Audit entries from this
		// path get a synthetic identity (role 'employee' is the least
		// privileged). The original upload audit (written by the HTTP route)
		// carries the real user identity.
		user:
			payload.userId && payload.userEmail
				? {
						id: payload.userId,
						email: payload.userEmail,
						role: 'employee'
					}
				: null
	});

	// VisionAI "field" extraction mode: the user pre-selected a category before
	// upload, so steer the vision OCR with that category's field list and skip
	// classification (the preset is the source of truth). Falls back to raw_text
	// when the category has no extractable fields (prompt builder returns null).
	const fieldPrompt =
		payload.extractionMode === 'field' && payload.presetCategoryId
			? buildVisionFieldExtractionPrompt(payload.presetCategoryId)
			: null;
	const presetCategoryId = fieldPrompt ? payload.presetCategoryId : undefined;
	const presetDocumentType = presetCategoryId
		? documentTypeForCategory(presetCategoryId)
		: undefined;

	await service.processDocument({
		tenantId: payload.tenantId,
		documentId: payload.documentId,
		clientExtractedText: payload.clientExtractedText,
		clientExtractionMethod: payload.clientExtractionMethod,
		// Image OCR route the user chose at upload (vision LLM vs OCR.space).
		ocrStrategy: payload.ocrStrategy,
		// Field mode: pre-selected category + category-guided vision prompt.
		presetCategoryId,
		presetDocumentType,
		visionFieldPrompt: fieldPrompt ?? undefined,
		// Category-first classification: classify straight into a finance
		// category (source of truth), instead of documentType → lossy map.
		// Skipped entirely when presetCategoryId is set (field mode).
		categoryClassifier: async ({ tenantId, documentId, fileName, text }) => {
			const r = await classifyDocumentCategoryCapability.execute(
				{ documentId, fileName, text },
				{ tenantId, userId: payload.userId, env, useMock: !env.AI }
			);
			return {
				categoryId: r.categoryId,
				confidence: r.confidence,
				documentType: r.documentType,
				possibleTypes: r.possibleTypes,
				reason: r.reason
			};
		},
		fieldExtractor: async ({
			tenantId,
			documentId,
			fileName,
			text,
			documentType,
			classificationConfidence,
			categoryId: classifiedCategoryId
		}) => {
			// Prefer the category-first classifier's choice; fall back to the
			// documentType→category map only when it didn't run. null categoryId =
			// no auto-extract (the inbox asks the user to pick a category).
			const categoryId =
				classifiedCategoryId ?? categoryIdForDocumentType(documentType ?? 'unknown');
			if (!categoryId) return null;

			// Extra guard: skip extraction when classification confidence is
			// very low — better to let the user pick than to pre-fill from a
			// wrong category (e.g. classifier guessed `supplier_invoice` for a
			// receipt).
			if (classificationConfidence < 0.4) return null;

			const result = await extractDocumentFieldsCapability.execute(
				{
					documentId,
					fileName,
					text,
					categoryId,
					artifactConfidence: classificationConfidence
				},
				{ tenantId, userId: payload.userId, env, useMock: !env.AI }
			);

			return {
				fields: result.fields as unknown as Record<string, unknown>,
				confidence: result.fieldConfidence,
				evidence: result.evidence,
				sourceQuotes: result.sourceQuotes,
				fieldCandidates: result.fieldCandidates,
				categoryId
			};
		}
	});
}
