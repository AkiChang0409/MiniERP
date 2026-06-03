import { z } from 'zod';

export const documentSourceSchema = z.enum([
	'manual_upload',
	'email_attachment',
	'google_drive',
	'dropbox',
	'whatsapp_upload',
	'mobile_scan',
	'accounting_export',
	'bulk_zip_upload',
	'api_upload'
]);

export type DocumentSource = z.infer<typeof documentSourceSchema>;

export const documentTypeSchema = z.enum([
	'supplier_invoice',
	'receipt',
	'purchase_order',
	'customer_invoice',
	'logistics_document',
	'contract',
	'quotation',
	'bank_statement',
	'tax_document',
	'unknown'
]);

export type DocumentType = z.infer<typeof documentTypeSchema>;

export const documentProcessingStatusSchema = z.enum([
	'received',
	'stored',
	'text_extraction_pending',
	'text_extracted',
	'ocr_pending',
	'ocr_completed',
	'classification_pending',
	'classified',
	'fields_extraction_pending',
	'ready_for_review',
	'ready_for_workflow',
	'confirmed',
	'abandoned',
	'needs_manual_review',
	'failed'
]);

export type DocumentProcessingStatus = z.infer<typeof documentProcessingStatusSchema>;

export const documentSecurityFlagSchema = z.enum([
	'untrusted_external_content',
	'possible_prompt_injection',
	'encrypted_file',
	'password_protected_file',
	'unsupported_format',
	'low_ocr_confidence',
	'suspicious_filename',
	'large_file',
	'duplicate_file',
	'source_not_verified'
]);

export type DocumentSecurityFlag = z.infer<typeof documentSecurityFlagSchema>;

/**
 * A processed sibling of the original upload. For phone-captured financial
 * images the client produces a `vision_enhanced` version (document-cropped,
 * deskewed, illumination-normalised, gently sharpened) and uploads it
 * alongside the untouched original. Text extraction / vision OCR reads this
 * derived ref when present; the original is kept for audit, human review and
 * vision fallback. Stored inside `originalFile` JSON — no column migration.
 */
export const derivedFileSchema = z.object({
	kind: z.enum(['vision_enhanced']),
	mimeType: z.string(),
	sizeBytes: z.number().int().nonnegative(),
	storageRef: z.string(),
	checksum: z.string().optional(),
	/** Client preprocessing provenance (which steps ran). Free-form. */
	preprocessing: z.record(z.string(), z.unknown()).optional()
});

export type DerivedFileMeta = z.infer<typeof derivedFileSchema>;

export const originalFileMetaSchema = z.object({
	fileId: z.string(),
	fileName: z.string(),
	mimeType: z.string(),
	sizeBytes: z.number().int().nonnegative(),
	storageRef: z.string(),
	checksum: z.string().optional(),
	derived: derivedFileSchema.optional()
});

export type OriginalFileMeta = z.infer<typeof originalFileMetaSchema>;

export const documentSourceMetadataSchema = z
	.object({
		email: z
			.object({
				messageId: z.string(),
				threadId: z.string().optional(),
				from: z.string().optional(),
				to: z.array(z.string()).optional(),
				subject: z.string().optional(),
				receivedAt: z.string().optional(),
				attachmentName: z.string().optional()
			})
			.optional(),
		manualUpload: z
			.object({
				uploadedBy: z.string(),
				uploadedFrom: z.enum(['ai_panel', 'finance_workspace', 'task_mode'])
			})
			.optional(),
		drive: z
			.object({
				provider: z.enum(['google_drive', 'dropbox']),
				externalFileId: z.string(),
				externalPath: z.string().optional()
			})
			.optional(),
		bulkUpload: z
			.object({
				batchId: z.string(),
				zipFileId: z.string().optional()
			})
			.optional()
	})
	.partial();

export type DocumentSourceMetadata = z.infer<typeof documentSourceMetadataSchema>;

export const textExtractionPageSchema = z.object({
	pageNumber: z.number().int().positive(),
	text: z.string().optional(),
	confidence: z.number().min(0).max(1).optional()
});

export const textExtractionResultSchema = z.object({
	method: z.enum(['pdf_text', 'ocr', 'vision_model', 'manual']),
	status: z.enum(['success', 'partial', 'failed']),
	text: z.string().optional(),
	pages: z.array(textExtractionPageSchema).optional(),
	language: z.string().optional(),
	confidence: z.number().min(0).max(1).optional(),
	provider: z.string().optional(),
	providerJobId: z.string().optional(),
	error: z
		.object({
			code: z.string(),
			message: z.string()
		})
		.optional()
});

export type TextExtractionResult = z.infer<typeof textExtractionResultSchema>;

export const documentClassificationResultSchema = z.object({
	documentType: documentTypeSchema,
	confidence: z.number().min(0).max(1),
	possibleTypes: z
		.array(
			z.object({
				documentType: documentTypeSchema,
				confidence: z.number().min(0).max(1)
			})
		)
		.optional(),
	reason: z.string().optional(),
	modelId: z.string().optional(),
	promptVersion: z.string().optional(),
	schemaVersion: z.string().optional()
});

export type DocumentClassificationResult = z.infer<typeof documentClassificationResultSchema>;

/**
 * AI-suggested business fields ready for user review (Ship 2 inbox pipeline).
 * Worker populates this after classify + extract-document-fields runs against
 * the suggested category. ConfirmStep renders fields with confidence colors.
 */
export const suggestedFieldsResultSchema = z.object({
	fields: z.record(z.string(), z.unknown()),
	confidence: z.record(z.string(), z.number().min(0).max(1)).optional(),
	evidence: z.unknown().optional(),
	/** Verbatim text excerpts keyed by LLM camelCase field name. Used by the review UI
	 *  to highlight the source sentence in the raw-text panel when the user focuses a field. */
	sourceQuotes: z.record(z.string(), z.string()).optional(),
	categoryId: z.string(),
	extractedAt: z.string()
});

export type SuggestedFieldsResult = z.infer<typeof suggestedFieldsResultSchema>;

export const documentArtifactSchema = z.object({
	id: z.string(),
	tenantId: z.string(),
	source: documentSourceSchema,
	originalFile: originalFileMetaSchema,
	sourceMetadata: documentSourceMetadataSchema.optional(),
	documentType: documentTypeSchema.optional(),
	processingStatus: documentProcessingStatusSchema,
	textExtraction: textExtractionResultSchema.optional(),
	classification: documentClassificationResultSchema.optional(),
	suggestedFields: suggestedFieldsResultSchema.optional(),
	suggestedCategoryId: z.string().optional(),
	normalizedMetadata: z.record(z.string(), z.unknown()).optional(),
	securityFlags: z.array(documentSecurityFlagSchema).optional(),
	createdAt: z.string(),
	updatedAt: z.string()
});

export type DocumentArtifact = z.infer<typeof documentArtifactSchema>;
