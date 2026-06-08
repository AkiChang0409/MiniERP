/**
 * Queue message contracts for the document-intake module.
 *
 * Shared between the producer (SvelteKit HTTP routes — POST /api/documents,
 * /api/documents/[id]/reclassify) and the consumer
 * (workers/document-processor.ts). Keep the message shape stable; bump `v`
 * when the shape changes so old in-flight messages don't crash a newly
 * deployed consumer.
 */

export interface DocumentProcessorMessage {
	/**
	 * Schema version of this message. Bump when the contract changes so the
	 * consumer can refuse messages it cannot interpret rather than silently
	 * mis-processing them. Current: 1.
	 */
	v: 1;

	/** Document artifact id (== document_artifacts.id) */
	documentId: string;
	tenantId: string;

	/** Originator metadata for audit trail. */
	userId?: string;
	userEmail?: string;

	/**
	 * Optional pre-extracted text from the browser pdfjs path. When present,
	 * the consumer skips its server-side text extraction. See
	 * `src/app/ai-panel/components/workflow-panel/layers/finance-document-intake/UploadStep.svelte`
	 * for the producer-side extraction logic (Ship 1).
	 */
	clientExtractedText?: string;
	clientExtractionMethod?: 'pdfjs' | 'vision_first_page' | 'manual';

	/**
	 * Image OCR route chosen by the user before upload:
	 *   - `vision_openai` (default) — vision LLM via external AI API (OpenAI)
	 *   - `vision_workers_ai` — vision LLM via Cloudflare Workers AI
	 *   - `ocr_api` — OCR.space
	 * Only affects images; downstream classification + field extraction are
	 * identical for all. Legacy `'vision_ai'` is treated as `vision_openai`.
	 */
	ocrStrategy?: 'vision_openai' | 'vision_workers_ai' | 'ocr_api';

	/**
	 * Vision text-extraction sub-mode (only meaningful on a vision `ocrStrategy`):
	 *   - `raw_text` (default) — generic verbatim transcription, THEN the text
	 *     LLM classifies + extracts fields (the original two-LLM flow).
	 *   - `field` — the user pre-selects `presetCategoryId`, so the vision model
	 *     is steered with that category's field list and emits a focused Markdown
	 *     transcription. Classification is skipped (category is known); the text
	 *     LLM still maps the Markdown into the confirmable JSON.
	 * Ignored for the `ocr_api` route.
	 */
	extractionMode?: 'raw_text' | 'field';

	/**
	 * Category id the user picked up-front in `field` mode (e.g.
	 * `expense.sales_cost.invoice`). Drives the vision field prompt AND becomes
	 * the artifact's `suggestedCategoryId` (classification is bypassed). Unset in
	 * `raw_text` mode.
	 */
	presetCategoryId?: string;
}
