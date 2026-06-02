/**
 * Typed client helpers for the Stage 3 finance-agent + workflow endpoints.
 * Each helper unwraps the `{ ok, data, error }` envelope and surfaces a single
 * typed value (or throws on failure) so step components stay short.
 */

interface Envelope<T> {
	ok?: boolean;
	data?: T;
	error?: string;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	let payload: Envelope<T>;
	try {
		payload = (await res.json()) as Envelope<T>;
	} catch {
		throw new Error(`Bad response from ${url} (${res.status})`);
	}
	if (!res.ok || !payload.ok || payload.data === undefined) {
		throw new Error(payload.error ?? `Request failed (${res.status})`);
	}
	return payload.data;
}

async function postMultipart<T>(url: string, form: FormData): Promise<T> {
	const res = await fetch(url, { method: 'POST', body: form });
	let payload: Envelope<T>;
	try {
		payload = (await res.json()) as Envelope<T>;
	} catch {
		throw new Error(`Bad response from ${url} (${res.status})`);
	}
	if (!res.ok || !payload.ok || payload.data === undefined) {
		throw new Error(payload.error ?? `Upload failed (${res.status})`);
	}
	return payload.data;
}

async function getJson<T>(url: string): Promise<T> {
	const res = await fetch(url, { method: 'GET' });
	let payload: Envelope<T>;
	try {
		payload = (await res.json()) as Envelope<T>;
	} catch {
		throw new Error(`Bad response from ${url} (${res.status})`);
	}
	if (!res.ok || !payload.ok || payload.data === undefined) {
		throw new Error(payload.error ?? `Request failed (${res.status})`);
	}
	return payload.data;
}

export interface ExtractedInvoiceFields {
	documentNumber: string;
	counterpartyName: string;
	currency: string;
	totalAmount: number;
	gstAmount: number;
	issueDate: string;
	dueDate: string;
}

export interface SupplierCandidate {
	id: string;
	name: string;
	matchScore: number;
	recentInvoiceCount: number;
}

export interface PurchaseOrderCandidate {
	id: string;
	poNumber: string;
	supplierId: string;
	supplierName: string;
	totalAmount: number;
	currency: string;
	matchScore: number;
}

export interface DuplicateInfo {
	isDuplicate: boolean;
	reason: string | null;
}

export interface ExtractionResult {
	fields: ExtractedInvoiceFields;
	confidence: number;
	evidence: Array<{ type: string; refId: string; summary: string }>;
}

export interface MatchingResult {
	supplierCandidates: SupplierCandidate[];
	poCandidates: PurchaseOrderCandidate[];
	duplicate: DuplicateInfo;
}

export interface DocumentIntakePayload {
	documentId: string;
	fileName?: string;
}

export type WorkflowStepId =
	// vendor-invoice-intake (Phase 1+2)
	| 'trigger'
	| 'document_intake'
	| 'invoice_field_extraction'
	| 'matching'
	| 'user_confirmation'
	| 'record_creation'
	| 'completion'
	// financial-document-intake (Phase 3)
	| 'bucket_selection'
	| 'category_selection'
	| 'field_extraction'
	| 'project_selection'
	// allowance-recording (Phase 3 stage 5)
	| 'manual_entry';

export type WorkflowBucket = 'expense' | 'revenue' | 'document_only';

export interface WorkflowStateRecord {
	id: string;
	workflowId: string;
	step: WorkflowStepId;
	status: 'active' | 'completed' | 'aborted';
	data: {
		document?: DocumentIntakePayload;
		extraction?: ExtractionResult;
		matching?: MatchingResult;
		[k: string]: unknown;
	};
}

export interface AdvanceResponse {
	currentStep: WorkflowStepId;
	state: WorkflowStateRecord;
}

export interface StartResponse {
	workflowId: string;
	currentStep: WorkflowStepId;
	status: 'active' | 'completed' | 'aborted';
}

export function startVendorInvoiceWorkflow(opts: {
	source?: string;
	intentHint?: string;
}): Promise<StartResponse> {
	return postJson<StartResponse>('/api/finance/workflow', {
		workflowId: 'vendor-invoice-intake',
		source: opts.source,
		intentHint: opts.intentHint
	});
}

/** Phase 3: start the unified financial-document-intake workflow with an
 *  optional pre-selected category id. */
export function startFinancialDocumentIntakeWorkflow(opts: {
	source?: string;
	intentHint?: string;
	categoryId?: string;
}): Promise<StartResponse> {
	return postJson<StartResponse>('/api/finance/workflow', {
		workflowId: 'financial-document-intake',
		source: opts.source,
		intentHint: opts.intentHint,
		categoryId: opts.categoryId
	});
}

/** Phase 3 stage 5: start the no-document allowance-recording workflow. */
export function startAllowanceRecordingWorkflow(opts: {
	source?: string;
}): Promise<StartResponse> {
	return postJson<StartResponse>('/api/finance/workflow', {
		workflowId: 'allowance-recording',
		source: opts.source
	});
}

export interface AllowanceFormPayload {
	staffName: string;
	destination: string;
	dateStart: string;
	dateEnd: string;
	days: number;
	dailyRate: number;
	currency: string;
	notes?: string;
}

export interface AllowanceConfirmPayload extends AllowanceFormPayload {
	totalAmount: number;
}

export function confirmAllowanceWorkflow(
	workflowId: string,
	body: { allowancePayload: AllowanceConfirmPayload; allowancePayloadHash: string }
): Promise<ConfirmResponse> {
	return postJson<ConfirmResponse>(`/api/finance/workflow/${workflowId}/confirm`, body);
}

export interface AllowanceAdvanceEntry {
	staffName: string;
	destination: string;
	dateStart: string;
	dateEnd: string;
	days: number;
	dailyRate: number;
	currency: string;
	notes?: string;
}

export function advanceWorkflow(
	workflowId: string,
	body: {
		targetStep: WorkflowStepId;
		payload?: {
			documentId?: string;
			fileName?: string;
			bucket?: WorkflowBucket;
			categoryId?: string;
			projectId?: string | null;
			/** allowance-recording manual_entry payload. */
			allowanceEntry?: AllowanceAdvanceEntry;
		};
	}
): Promise<AdvanceResponse> {
	return postJson<AdvanceResponse>(`/api/finance/workflow/${workflowId}/advance`, body);
}

export interface ConfirmedFields {
	documentNumber: string;
	counterpartyName: string;
	currency: string;
	totalAmount: number;
	gstAmount: number;
	issueDate: string;
	dueDate: string;
}

export interface ConfirmedPayload {
	documentId: string;
	supplierId: string | null;
	poId: string | null;
	projectId: string | null;
	fields: ConfirmedFields;
}

export interface SuggestedTask {
	title: string;
	detail: string;
	workflowId: 'vendor-invoice-intake' | null;
	count: number;
}

export interface ConfirmResponse {
	entityId: string;
	auditRef: string;
	entityRoute: string;
	nextTask: SuggestedTask | null;
}

export function confirmWorkflow(
	workflowId: string,
	body: { payload: ConfirmedPayload; payloadHash: string }
): Promise<ConfirmResponse> {
	return postJson<ConfirmResponse>(`/api/finance/workflow/${workflowId}/confirm`, body);
}

// ---------------------------------------------------------------------------
// Document Intake helpers (Phase 2)
// ---------------------------------------------------------------------------

export type DocumentProcessingStatus =
	| 'received'
	| 'stored'
	| 'text_extraction_pending'
	| 'text_extracted'
	| 'ocr_pending'
	| 'ocr_completed'
	| 'classification_pending'
	| 'classified'
	| 'fields_extraction_pending'
	| 'ready_for_review'
	| 'ready_for_workflow'
	| 'confirmed'
	| 'needs_manual_review'
	| 'failed';

export type DocumentSecurityFlag =
	| 'untrusted_external_content'
	| 'possible_prompt_injection'
	| 'encrypted_file'
	| 'password_protected_file'
	| 'unsupported_format'
	| 'low_ocr_confidence'
	| 'suspicious_filename'
	| 'large_file'
	| 'duplicate_file'
	| 'source_not_verified';

export interface DocumentClassificationView {
	documentType:
		| 'supplier_invoice'
		| 'receipt'
		| 'purchase_order'
		| 'customer_invoice'
		| 'logistics_document'
		| 'contract'
		| 'quotation'
		| 'bank_statement'
		| 'tax_document'
		| 'unknown';
	confidence: number;
	reason?: string;
}

export interface DocumentArtifactPostResponse {
	id: string;
	processingStatus: DocumentProcessingStatus;
	documentType?: DocumentClassificationView['documentType'];
	originalFile: {
		fileId: string;
		fileName: string;
		mimeType: string;
		sizeBytes: number;
	};
	textExtraction?: {
		method: 'pdf_text' | 'ocr' | 'vision_model' | 'manual';
		status: 'success' | 'partial' | 'failed';
		confidence?: number;
		provider?: string;
		error?: { code: string; message: string };
	};
	classification?: DocumentClassificationView;
	securityFlags?: DocumentSecurityFlag[];
	createdAt: string;
	updatedAt: string;
}

export interface DocumentStatusResponse {
	documentId: string;
	processingStatus: DocumentProcessingStatus;
	documentType?: DocumentClassificationView['documentType'];
	classification?: DocumentClassificationView;
	securityFlags: DocumentSecurityFlag[];
	updatedAt: string;
}

export function uploadDocument(
	file: File,
	opts: {
		uploadedFrom?: 'ai_panel' | 'finance_workspace' | 'task_mode';
		clientExtractedText?: string;
		clientExtractionMethod?: 'pdfjs' | 'vision_first_page' | 'manual';
	} = {}
): Promise<DocumentArtifactPostResponse> {
	const form = new FormData();
	form.append('file', file);
	form.append('uploadedFrom', opts.uploadedFrom ?? 'ai_panel');
	if (opts.clientExtractedText) {
		form.append('clientExtractedText', opts.clientExtractedText);
		form.append('clientExtractionMethod', opts.clientExtractionMethod ?? 'manual');
	}
	return postMultipart<DocumentArtifactPostResponse>('/api/documents', form);
}

export function getDocumentStatus(documentId: string): Promise<DocumentStatusResponse> {
	return getJson<DocumentStatusResponse>(
		`/api/documents/${encodeURIComponent(documentId)}/status`
	);
}

export const TERMINAL_DOCUMENT_STATUSES: DocumentProcessingStatus[] = [
	'ready_for_review',
	'ready_for_workflow',
	'confirmed',
	'needs_manual_review',
	'failed'
];

export const READY_DOCUMENT_STATUSES: DocumentProcessingStatus[] = [
	'ready_for_review',
	'ready_for_workflow',
	'text_extracted',
	'classified'
];
