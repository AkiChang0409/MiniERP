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
}
