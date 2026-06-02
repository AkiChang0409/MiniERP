import type { DBClient } from '../../../infrastructure/db';
import { appendAgentAuditEntry } from '../../../platform/audit/audit-log';
import {
	buildArtifactStorageKey,
	createFileService,
	type FileServiceContract,
	type StoredFileRef
} from '../../../platform/files/file-service';
import { extractTextFromBlob } from '../../../platform/ai/text-extraction';
import { classifyDocumentCapability } from '../capabilities/classify-document';
import { DocumentArtifactRepository } from '../repositories/document-artifact-repository';
import type { DocumentArtifactLibraryFilters } from '../repositories/document-artifact-repository';
import type {
	DocumentArtifact,
	DocumentClassificationResult,
	DocumentProcessingStatus,
	SuggestedFieldsResult,
	TextExtractionResult
} from '../schemas/document-artifact.schema';

export const DOCUMENT_INTAKE_AGENT_ID = 'document-intake';
const DOCUMENT_INTAKE_VERSION = '0.1.0';
const MIN_CLASSIFICATION_CONFIDENCE = 0.5;
const ABANDONABLE_STATUSES: DocumentProcessingStatus[] = [
	// Terminal-ish states the user can clean up after the fact.
	'ready_for_review',
	'ready_for_workflow',
	'needs_manual_review',
	'failed',
	// In-flight states — user wants to interrupt a stuck pipeline. The
	// async worker checks for `abandoned` between stages (see
	// `processDocument` + `repo.setStatusIfActive`) and exits early.
	'received',
	'stored',
	'text_extraction_pending',
	'text_extracted',
	'ocr_pending',
	'ocr_completed',
	'classification_pending',
	'classified',
	'fields_extraction_pending'
];

class AbortedByUser extends Error {
	override readonly name = 'AbortedByUser';
}

const SUPPORTED_MIME_PATTERNS = [
	/^application\/pdf$/i,
	/^image\//i,
	/^application\/zip$/i, // tolerate; ZIP expanded client-side into individual files
	/^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/i, // .docx
	/^application\/msword$/i, // .doc (legacy; extraction returns partial)
	/^message\/rfc822$/i // .eml
];

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

export interface DocumentIntakeServiceContext {
	db: DBClient;
	env: Env;
	user?: App.Locals['user'];
}

export interface CreateDocumentFromUploadInput {
	tenantId?: string;
	uploadedBy: string;
	uploadedFrom?: 'ai_panel' | 'finance_workspace' | 'task_mode';
	fileName: string;
	mimeType: string;
	body: ArrayBuffer | Uint8Array;
	sizeBytes?: number;
}

/**
 * Optional callback that runs after classification to extract structured
 * fields per the document type. Lives in finance domain (it's
 * category-aware), so document-intake takes it as an injected callback to
 * preserve modular boundary. Worker provides this when calling
 * processDocument; legacy sync callers omit it.
 */
export interface FieldExtractorInput {
	tenantId: string;
	documentId: string;
	fileName: string;
	text: string;
	documentType: DocumentArtifact['documentType'];
	classificationConfidence: number;
}

export interface FieldExtractorResult {
	fields: Record<string, unknown>;
	confidence: Record<string, number> | undefined;
	evidence?: unknown;
	/** Verbatim source quotes keyed by LLM camelCase field name. Passed through
	 *  to suggestedFields so the review UI can highlight the source sentence. */
	sourceQuotes?: Record<string, string>;
	categoryId: string;
}

export type FieldExtractor = (
	input: FieldExtractorInput
) => Promise<FieldExtractorResult | null>;

export interface ProcessDocumentInput {
	tenantId?: string;
	documentId: string;
	mode?: 'sync';
	useMock?: boolean;
	/**
	 * Pre-extracted text supplied by the upload caller (typically the AI Panel
	 * client-side pdfjs path). When present, processDocument skips its own
	 * server-side text extraction and trusts this text. The Cloudflare Workers
	 * runtime cannot run pdfjs reliably, so the browser is the canonical text
	 * extraction path for PDF documents (Ship 1 of upload pipeline redesign).
	 */
	clientExtractedText?: string;
	/** How the client extracted the text. Used in audit metadata for evaluation. */
	clientExtractionMethod?: 'pdfjs' | 'vision_first_page' | 'manual';
	/**
	 * Optional finance-side field extraction step. When present and the
	 * artifact reaches the `classified` state, the service invokes this to
	 * populate `suggestedFields` + `suggestedCategoryId` before transitioning
	 * to `ready_for_review`. Async pipeline (queue worker) supplies this;
	 * legacy sync callers omit it. Module boundary preserved by inversion of
	 * control — document-intake never imports finance.
	 */
	fieldExtractor?: FieldExtractor;
}

export interface DocumentArtifactView {
	id: string;
	tenantId: string;
	source: DocumentArtifact['source'];
	processingStatus: DocumentProcessingStatus;
	documentType?: DocumentArtifact['documentType'];
	originalFile: {
		fileId: string;
		fileName: string;
		mimeType: string;
		sizeBytes: number;
		// storageRef intentionally omitted
	};
	textExtraction?: {
		method: TextExtractionResult['method'];
		status: TextExtractionResult['status'];
		confidence?: number;
		language?: string;
		provider?: string;
		// raw `text` intentionally omitted from the view-model
		error?: TextExtractionResult['error'];
	};
	classification?: DocumentClassificationResult;
	suggestedFields?: SuggestedFieldsResult;
	suggestedCategoryId?: string;
	securityFlags?: DocumentArtifact['securityFlags'];
	createdAt: string;
	updatedAt: string;
}

function toView(artifact: DocumentArtifact): DocumentArtifactView {
	return {
		id: artifact.id,
		tenantId: artifact.tenantId,
		source: artifact.source,
		processingStatus: artifact.processingStatus,
		documentType: artifact.documentType,
		originalFile: {
			fileId: artifact.originalFile.fileId,
			fileName: artifact.originalFile.fileName,
			mimeType: artifact.originalFile.mimeType,
			sizeBytes: artifact.originalFile.sizeBytes
		},
		textExtraction: artifact.textExtraction
			? {
					method: artifact.textExtraction.method,
					status: artifact.textExtraction.status,
					confidence: artifact.textExtraction.confidence,
					language: artifact.textExtraction.language,
					provider: artifact.textExtraction.provider,
					error: artifact.textExtraction.error
				}
			: undefined,
		classification: artifact.classification,
		suggestedFields: artifact.suggestedFields,
		suggestedCategoryId: artifact.suggestedCategoryId,
		securityFlags: artifact.securityFlags,
		createdAt: artifact.createdAt,
		updatedAt: artifact.updatedAt
	};
}

export interface DocumentIntakeService {
	createDocumentFromUpload(
		input: CreateDocumentFromUploadInput
	): Promise<DocumentArtifact>;
	processDocument(input: ProcessDocumentInput): Promise<DocumentArtifact>;
	getDocumentArtifact(input: {
		tenantId?: string;
		documentId: string;
	}): Promise<DocumentArtifact | null>;
	markConfirmed(input: {
		tenantId?: string;
		documentId: string;
		entityType?: string;
		entityId?: string;
		categoryId?: string;
	}): Promise<DocumentArtifact | null>;
	abandonIntake(input: {
		tenantId?: string;
		documentId: string;
		reason?: string | null;
	}): Promise<
		| { ok: true; artifact: DocumentArtifact }
		| {
				ok: false;
				status: 'not_found' | 'not_abandonable';
				message: string;
				artifact?: DocumentArtifact;
		  }
	>;
	replaceSuggestedFields(input: {
		tenantId?: string;
		documentId: string;
		fields: Record<string, unknown>;
		confidence?: Record<string, number>;
		evidence?: unknown;
		sourceQuotes?: Record<string, string>;
		categoryId: string;
	}): Promise<DocumentArtifact | null>;
	listDocumentArtifacts(input: DocumentArtifactLibraryFilters): Promise<{
		items: DocumentArtifactView[];
		total: number;
		limit: number;
		offset: number;
	}>;
	toView: typeof toView;
}

export interface CreateServiceOptions {
	repo?: DocumentArtifactRepository;
	fileService?: FileServiceContract;
}

export function createDocumentIntakeService(
	ctx: DocumentIntakeServiceContext,
	opts: CreateServiceOptions = {}
): DocumentIntakeService {
	const repo = opts.repo ?? new DocumentArtifactRepository(ctx.db);
	const fileService = opts.fileService ?? createFileService(ctx.env);

	async function audit(
		artifact: { id: string; tenantId: string; processingStatus?: DocumentProcessingStatus },
		event: string,
		status: 'ok' | 'failed' | 'denied' = 'ok',
		extra?: { errorCode?: string; outputRefs?: unknown }
	) {
		await appendAgentAuditEntry(ctx.db, {
			agentId: DOCUMENT_INTAKE_AGENT_ID,
			agentVersion: DOCUMENT_INTAKE_VERSION,
			userId: ctx.user?.id ?? null,
			userEmail: ctx.user?.email ?? null,
			tenantId: artifact.tenantId,
			workflowId: artifact.id,
			workflowStep: artifact.processingStatus,
			riskLevel: 'R1',
			permissionResult: 'allowed',
			confirmationRequired: false,
			finalAction: event,
			status,
			errorCode: extra?.errorCode,
			outputRefs: extra?.outputRefs
		});
	}

	function validateFile(input: CreateDocumentFromUploadInput) {
		const bodyLength =
			input.body instanceof Uint8Array
				? input.body.byteLength
				: input.body.byteLength;
		const size = input.sizeBytes ?? bodyLength;
		if (size <= 0) throw new Error('File body is empty.');
		if (size > MAX_FILE_BYTES) {
			throw new Error(`File too large (${size} bytes, max ${MAX_FILE_BYTES}).`);
		}
		const mimeOk = SUPPORTED_MIME_PATTERNS.some((re) => re.test(input.mimeType));
		if (!mimeOk) {
			throw new Error(`Unsupported file type: ${input.mimeType || 'unknown'}.`);
		}
		return size;
	}

	async function createDocumentFromUpload(
		input: CreateDocumentFromUploadInput
	): Promise<DocumentArtifact> {
		const tenantId = input.tenantId ?? 'default';
		const sizeBytes = validateFile(input);

		const id = crypto.randomUUID();
		const storageKey = buildArtifactStorageKey({
			tenantId,
			fileName: input.fileName,
			artifactId: id
		});

		let stored: StoredFileRef;
		try {
			stored = await fileService.putBlob({
				key: storageKey,
				body: input.body,
				contentType: input.mimeType
			});
		} catch (err) {
			throw new Error(
				`File storage failed: ${err instanceof Error ? err.message : 'unknown error'}`
			);
		}

		const artifact = await repo.create({
			id,
			tenantId,
			source: 'manual_upload',
			sourceMetadata: {
				manualUpload: {
					uploadedBy: input.uploadedBy,
					uploadedFrom: input.uploadedFrom ?? 'ai_panel'
				}
			},
			processingStatus: 'stored',
			originalFile: {
				fileId: id,
				fileName: input.fileName,
				mimeType: input.mimeType,
				sizeBytes: stored.sizeBytes,
				storageRef: stored.key,
				checksum: stored.checksum
			},
			securityFlags: ['untrusted_external_content']
		});

		await audit(artifact, 'document.received');
		await audit(artifact, 'document.stored');
		return artifact;
	}

	async function processDocument(
		input: ProcessDocumentInput
	): Promise<DocumentArtifact> {
		const tenantId = input.tenantId ?? 'default';
		const artifact = await repo.findById(input.documentId, tenantId);
		if (!artifact) {
			throw new Error(`Document artifact not found: ${input.documentId}`);
		}

		if (artifact.processingStatus !== 'stored' &&
			artifact.processingStatus !== 'received' &&
			artifact.processingStatus !== 'needs_manual_review' &&
			artifact.processingStatus !== 'failed') {
			// Already further along (or `abandoned` — user cancelled before we
			// dequeued); don't re-run.
			return artifact;
		}

		const setStatusOrAbort = async (status: DocumentProcessingStatus): Promise<void> => {
			const ok = await repo.setStatusIfActive(artifact.id, status);
			if (!ok) throw new AbortedByUser();
		};

		try {
			await setStatusOrAbort('text_extraction_pending');

			// Ship 1: prefer client-extracted text. The browser pdfjs path produces
			// reliable text from PDFs (the Workers byte heuristic cannot — modern
			// PDFs compress text streams). The server only runs OCR when the client
			// could not extract (images, scanned PDFs that the client rasterized
			// to image and re-uploaded as JPEG).
			const useMock = input.useMock ?? !ctx.env.AI;
			let extraction: TextExtractionResult;
			if (input.clientExtractedText && input.clientExtractedText.length >= 48) {
				extraction = {
					method: 'manual',
					status: 'success',
					text: input.clientExtractedText,
					confidence: 0.9,
					provider: `client_${input.clientExtractionMethod ?? 'manual'}`
				};
			} else {
				extraction = await extractTextFromBlob({
					fileRef: {
						key: artifact.originalFile.storageRef,
						mimeType: artifact.originalFile.mimeType,
						fileName: artifact.originalFile.fileName,
						sizeBytes: artifact.originalFile.sizeBytes
					},
					fileService,
					env: ctx.env,
					useMock
				});
			}
			await repo.setTextExtraction(artifact.id, extraction);

			if (extraction.status === 'failed') {
				await setStatusOrAbort('failed');
				const failed = await repo.findById(artifact.id, tenantId);
				await audit(failed!, 'document.failed', 'failed', {
					errorCode: extraction.error?.code ?? 'extraction_failed'
				});
				return failed!;
			}

			if (extraction.status === 'partial' || !extraction.text) {
				await repo.addSecurityFlag(artifact.id, 'low_ocr_confidence');
				await setStatusOrAbort('needs_manual_review');
				const partial = await repo.findById(artifact.id, tenantId);
				await audit(partial!, 'document.needs_manual_review', 'failed', {
					errorCode: extraction.error?.code ?? 'low_text_yield'
				});
				return partial!;
			}

			await setStatusOrAbort('text_extracted');
			const afterText = await repo.findById(artifact.id, tenantId);
			await audit(afterText!, 'document.text_extracted', 'ok', {
				outputRefs: {
					method: extraction.method,
					confidence: extraction.confidence,
					provider: extraction.provider
				}
			});

			await setStatusOrAbort('classification_pending');
			const classification = await classifyDocumentCapability.execute(
				{
					text: extraction.text,
					fileName: artifact.originalFile.fileName,
					mimeType: artifact.originalFile.mimeType
				},
				{ tenantId, userId: ctx.user?.id, env: ctx.env, useMock: false }
			);
			await repo.setClassification(artifact.id, classification);

			const afterClass = await repo.findById(artifact.id, tenantId);
			await audit(afterClass!, 'document.classified', 'ok', {
				outputRefs: {
					documentType: classification.documentType,
					confidence: classification.confidence
				}
			});

			// Low classification confidence is a hint, not a blocker. The downstream
			// BucketStep / KindStep let the user pick the correct bucket+kind, so a
			// low-confidence classification just means "AI couldn't pre-fill, user
			// will choose". Mark a soft security flag for audit but keep the
			// artifact moving forward.
			if (classification.confidence < MIN_CLASSIFICATION_CONFIDENCE) {
				await repo.addSecurityFlag(artifact.id, 'low_ocr_confidence');
			}

			// Optional field extraction step (Ship 2 async pipeline). Worker
			// supplies a finance-aware extractor; legacy sync callers don't.
			if (input.fieldExtractor && extraction.text) {
				await setStatusOrAbort('fields_extraction_pending');
				try {
					const extracted = await input.fieldExtractor({
						tenantId,
						documentId: artifact.id,
						fileName: artifact.originalFile.fileName,
						text: extraction.text,
						documentType: classification.documentType,
						classificationConfidence: classification.confidence
					});
					if (extracted) {
						const result: SuggestedFieldsResult = {
							fields: extracted.fields,
							confidence: extracted.confidence,
							evidence: extracted.evidence,
							sourceQuotes: extracted.sourceQuotes,
							categoryId: extracted.categoryId,
							extractedAt: new Date().toISOString()
						};
						await repo.setSuggestedFields(artifact.id, result, extracted.categoryId);
						const afterFields = await repo.findById(artifact.id, tenantId);
						await audit(afterFields!, 'document.fields_extracted', 'ok', {
							outputRefs: {
								categoryId: extracted.categoryId,
								fieldCount: Object.keys(extracted.fields).length
							}
						});
					} else {
						// No category mapping — that's fine; user picks in inbox.
						await audit(artifact, 'document.fields_extraction_skipped', 'ok', {
							outputRefs: { reason: 'no_category_mapping' }
						});
					}
				} catch (err) {
					// Field extraction is best-effort. Failure does not fail the
					// artifact — it just means the user reviews with empty pre-fill.
					await audit(artifact, 'document.fields_extraction_failed', 'failed', {
						errorCode: err instanceof Error ? err.message.slice(0, 80) : 'extractor_error'
					});
				}
			}

			await setStatusOrAbort('ready_for_review');
			const ready = await repo.findById(artifact.id, tenantId);
			await audit(ready!, 'document.ready_for_review');
			return ready!;
		} catch (err) {
			if (err instanceof AbortedByUser) {
				// The /abandon endpoint already wrote processingStatus='abandoned'
				// and the abandon metadata. Nothing else to do — exit cleanly so
				// the queue handler acks the message (no retry).
				const aborted = await repo.findById(artifact.id, tenantId);
				await audit(aborted ?? artifact, 'document.processing_aborted', 'ok');
				return aborted ?? artifact;
			}
			// Use the active-guarded setter so a real failure on an already
			// user-cancelled artifact doesn't stomp 'abandoned' back to 'failed'.
			await repo.setStatusIfActive(artifact.id, 'failed');
			const failed = await repo.findById(artifact.id, tenantId);
			await audit(failed!, 'document.failed', 'failed', {
				errorCode: 'processing_exception'
			});
			throw err;
		}
	}

	async function getDocumentArtifact(input: {
		tenantId?: string;
		documentId: string;
	}): Promise<DocumentArtifact | null> {
		return repo.findById(input.documentId, input.tenantId ?? 'default');
	}

	/**
	 * Mark the artifact as user-confirmed (terminal state for the inbox
	 * pipeline). Called by POST /api/documents/[id]/confirm AFTER the
	 * downstream finance persistence (expenses/revenue/archive) succeeds.
	 * Confirmed artifacts drop out of the active inbox view but stay in the
	 * DB for the 30-day retention window (see Ship 3 for retention sweep).
	 */
	async function markConfirmed(input: {
		tenantId?: string;
		documentId: string;
		entityType?: string;
		entityId?: string;
		categoryId?: string;
	}): Promise<DocumentArtifact | null> {
		const tenantId = input.tenantId ?? 'default';
		const artifact = await repo.findById(input.documentId, tenantId);
		if (!artifact) return null;
		await repo.setStatus(artifact.id, 'confirmed');
		const updated = await repo.findById(artifact.id, tenantId);
		await audit(updated!, 'document.confirmed', 'ok', {
			outputRefs: {
				entityType: input.entityType,
				entityId: input.entityId,
				categoryId: input.categoryId
			}
		});
		return updated;
	}

	/**
	 * Abandon the current inbox intake without deleting the uploaded R2 object.
	 * This is distinct from UI "Cancel": it is a terminal artifact state meaning
	 * no expense, revenue, or archive record should be created from this upload.
	 */
	async function abandonIntake(input: {
		tenantId?: string;
		documentId: string;
		reason?: string | null;
	}): Promise<
		| { ok: true; artifact: DocumentArtifact }
		| {
				ok: false;
				status: 'not_found' | 'not_abandonable';
				message: string;
				artifact?: DocumentArtifact;
		  }
	> {
		const tenantId = input.tenantId ?? 'default';
		const artifact = await repo.findById(input.documentId, tenantId);
		if (!artifact) {
			return { ok: false, status: 'not_found', message: 'Document artifact not found.' };
		}
		if (!ABANDONABLE_STATUSES.includes(artifact.processingStatus)) {
			return {
				ok: false,
				status: 'not_abandonable',
				message: `Artifact is in '${artifact.processingStatus}' state and cannot be abandoned.`,
				artifact
			};
		}

		const reason = input.reason?.trim() || null;
		const metadata = {
			...(artifact.normalizedMetadata ?? {}),
			abandonedAt: new Date().toISOString(),
			abandonedBy: ctx.user?.id ?? null,
			abandonReason: reason,
			previousStatus: artifact.processingStatus,
			fileRetention: 'retained_for_audit_cleanup'
		};

		await repo.abandon(artifact.id, metadata);
		const updated = await repo.findById(artifact.id, tenantId);
		await audit(updated!, 'inbox.intake_abandoned', 'ok', {
			outputRefs: {
				previousStatus: artifact.processingStatus,
				reason,
				storageRef: artifact.originalFile.storageRef
			}
		});
		return { ok: true, artifact: updated! };
	}

	/**
	 * Replace `suggestedFields` and `suggestedCategoryId` after the user
	 * picks a different category in the inbox. Called by POST
	 * /api/documents/[id]/reclassify; the route runs the finance-side
	 * extract-document-fields capability against the existing textExtraction
	 * (no re-OCR, no re-classify) and passes the result here.
	 */
	async function replaceSuggestedFields(input: {
		tenantId?: string;
		documentId: string;
		fields: Record<string, unknown>;
		confidence?: Record<string, number>;
		evidence?: unknown;
		sourceQuotes?: Record<string, string>;
		categoryId: string;
	}): Promise<DocumentArtifact | null> {
		const tenantId = input.tenantId ?? 'default';
		const artifact = await repo.findById(input.documentId, tenantId);
		if (!artifact) return null;
		const result: SuggestedFieldsResult = {
			fields: input.fields,
			confidence: input.confidence,
			evidence: input.evidence,
			sourceQuotes: input.sourceQuotes,
			categoryId: input.categoryId,
			extractedAt: new Date().toISOString()
		};
		await repo.setSuggestedFields(artifact.id, result, input.categoryId);
		// Keep status at ready_for_review — reclassify is a re-render, not a
		// state machine transition.
		const updated = await repo.findById(artifact.id, tenantId);
		await audit(updated!, 'document.reclassified', 'ok', {
			outputRefs: {
				categoryId: input.categoryId,
				fieldCount: Object.keys(input.fields).length
			}
		});
		return updated;
	}

	async function listDocumentArtifacts(input: DocumentArtifactLibraryFilters): Promise<{
		items: DocumentArtifactView[];
		total: number;
		limit: number;
		offset: number;
	}> {
		const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
		const offset = Math.max(input.offset ?? 0, 0);
		const filters = { ...input, limit, offset };
		const [items, total] = await Promise.all([
			repo.listLibrary(filters),
			repo.countLibrary(filters)
		]);
		return {
			items: items.map(toView),
			total,
			limit,
			offset
		};
	}

	return {
		createDocumentFromUpload,
		processDocument,
		getDocumentArtifact,
		markConfirmed,
		abandonIntake,
		replaceSuggestedFields,
		listDocumentArtifacts,
		toView
	};
}
