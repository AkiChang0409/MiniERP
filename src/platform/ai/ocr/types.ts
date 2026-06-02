export type OcrQueueMessage = {
	id: string;
	fileKey: string;
	fileType: string;
	/**
	 * NOTE:
	 * - `expense_document` / `reference_document` are legacy queue flows.
	 * - Expense upload page has moved to "detect optional + direct save" and
	 *   no longer depends on async OCR queue for new expense records.
	 */
	entityType:
		| 'invoice_in'
		| 'expense'
		| 'expense_document'
		| 'reference_document'
		| 'contract'
		| 'quotation';
	entityId: string;
	projectId: string;
	metadata?: string;
};

export type ConfidenceBand = 'low' | 'medium' | 'high';

export type SourceSnippetMap = Partial<
	Record<'supplierName' | 'documentDate' | 'dueDate' | 'totalAmount' | 'gstAmount' | 'poNumber', string>
>;

/**
 * First-pass structured fields from `runOcrPipeline` (text layer / OCR + lightweight LLM).
 * Not specific to AR invoices — use `documentDate` for issue/transaction date on any voucher.
 */
export type OcrPipelineExtract = {
	documentDate: string | null;
	totalAmount: number | null;
	currency: string | null;
	supplierName: string | null;
	gstAmount: number | null;
	poNumber: string | null;
	dueDate: string | null;
	confidence: number;
	confidenceBand: ConfidenceBand;
	needsReview: boolean;
	validationWarnings: string[];
	sourceSnippets: SourceSnippetMap;
	extractionMethod: 'pdf_text' | 'pdf_text_layer' | 'docx_text' | 'external_ocr';
	ocrProvider: 'builtin_pdf' | 'pdf_native' | 'docx_native' | 'external_api' | 'external_api_mock' | 'workers_ai' | 'openai';
	llmProvider: 'heuristic' | 'external_api' | 'workers_ai';
	promptVersion: string;
	rawText: string;
};
