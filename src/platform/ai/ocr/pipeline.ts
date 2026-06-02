import { strFromU8, unzipSync } from 'fflate';
import { extractStructuredDocumentFields } from './llm-extract';
import { runImageDocumentOcr } from './image-document-ocr';
import type { OcrPipelineExtract } from './types';

const IMAGE_MIME = /^image\//i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i;

// ---------------------------------------------------------------------------
// PDF �?raw byte decode (same approach as SmartFinOnline)
//
// Key insight: invoice text sits in the uncompressed header/objects at the
// START of a PDF. FlateDecode binary streams come LATER. Reading the whole
// file introduces compressed-stream garbage; limiting to the first N bytes
// (like SmartFinOnline's 8 000) keeps only the readable ASCII content.
// We use 50 000 bytes to cover multi-page invoices safely.
// ---------------------------------------------------------------------------

const PDF_READ_LIMIT = 50_000;

function extractPdfText(bytes: ArrayBuffer): string {
	const decoder = new TextDecoder('utf-8', { fatal: false });
	const slice = bytes.byteLength > PDF_READ_LIMIT ? bytes.slice(0, PDF_READ_LIMIT) : bytes;
	return decoder
		.decode(slice)
		.replace(/\u0000/g, ' ')   // null bytes
		.replace(/\ufffd+/g, ' ')  // UTF-8 replacement chars from binary sections
		.replace(/\s{4,}/g, '   ') // collapse extreme whitespace runs
		.trim();
}

// ---------------------------------------------------------------------------
// DOCX �?unzip + parse <w:t> nodes (same logic as $platform/files/docx/extract-plain-text)
// ---------------------------------------------------------------------------

function docxXmlToPlainText(xml: string): string {
	const paragraphs: string[] = [];
	const pRegex = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
	let m: RegExpExecArray | null;
	while ((m = pRegex.exec(xml)) !== null) {
		const pxml = m[0];
		const parts: string[] = [];
		const tRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
		let tm: RegExpExecArray | null;
		while ((tm = tRe.exec(pxml)) !== null) {
			parts.push(
				tm[1]
					.replace(/&amp;/g, '&')
					.replace(/&lt;/g, '<')
					.replace(/&gt;/g, '>')
					.replace(/&quot;/g, '"')
					.replace(/&apos;/g, "'")
			);
		}
		const line = parts.join('').replace(/\s+/g, ' ').trim();
		if (line) paragraphs.push(line);
	}
	return paragraphs.join('\n').trim();
}

function extractDocxText(bytes: ArrayBuffer): string {
	try {
		const files = unzipSync(new Uint8Array(bytes));
		const xmlBytes = files['word/document.xml'];
		if (!xmlBytes) return '';
		const xml = strFromU8(xmlBytes, false);
		return docxXmlToPlainText(xml);
	} catch {
		return '';
	}
}

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

function readEnvString(env: Env, key: string): string {
	const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
	const fromPlatform = (env as unknown as Record<string, unknown>)[key];
	if (typeof fromPlatform === 'string' && fromPlatform.trim()) return fromPlatform.trim();
	const fromProcess = processEnv?.[key];
	return typeof fromProcess === 'string' ? fromProcess.trim() : '';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * OCR / text-extraction pipeline.
 *
 * PDF  �?raw UTF-8 decode (null bytes stripped) �?same as SmartFinOnline
 * DOCX �?fflate unzip + <w:t> node extraction
 * Image �?stub pending image OCR
 */
export async function runOcrPipeline(
	fileType: string,
	bytes: ArrayBuffer,
	env: Env,
	opts?: { fileName?: string; rawTextOverride?: string }
): Promise<OcrPipelineExtract> {
	const fileName = (opts?.fileName ?? '').toLowerCase();
	const mime = (fileType || '').toLowerCase();

	const isPdf = mime === 'application/pdf' || fileName.endsWith('.pdf');
	const isDocx =
		mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
		mime === 'application/msword' ||
		fileName.endsWith('.docx') ||
		fileName.endsWith('.doc');
	const isImage = IMAGE_MIME.test(mime) || IMAGE_EXT.test(fileName);

	const promptVersion = readEnvString(env, 'OCR_PROMPT_VERSION') || 'v1';

	if (isImage) {
		const ocrResult = await runImageDocumentOcr(env, {
			imageBytes: new Uint8Array(bytes),
			mimeType: mime || 'image/jpeg',
			fileName: opts?.fileName ?? ''
		});
		if (!ocrResult.ok) {
			return {
				documentDate: null, totalAmount: null, currency: null, supplierName: null,
				gstAmount: null, poNumber: null, dueDate: null,
				confidence: 0, confidenceBand: 'low', needsReview: true,
				validationWarnings: [`Image OCR failed: ${ocrResult.error}`],
				sourceSnippets: {}, extractionMethod: 'external_ocr', ocrProvider: ocrResult.provider,
				llmProvider: 'heuristic', promptVersion, rawText: ''
			};
		}
		const imageText = ocrResult.text.trim();
		if (imageText.length < 50) {
			return {
				documentDate: null, totalAmount: null, currency: null, supplierName: null,
				gstAmount: null, poNumber: null, dueDate: null,
				confidence: 0.1, confidenceBand: 'low', needsReview: true,
				validationWarnings: ['Image OCR returned very little text.'],
				sourceSnippets: {}, extractionMethod: 'external_ocr', ocrProvider: ocrResult.provider,
				llmProvider: 'heuristic', promptVersion, rawText: imageText
			};
		}
		const imageExtracted = await extractStructuredDocumentFields(imageText, {
			llmProvider: 'external', promptVersion, env
		});
		const imgConfidence = imageExtracted.llmProvider !== 'heuristic' ? 0.75 : 0.45;
		return {
			documentDate: imageExtracted.documentDate, totalAmount: imageExtracted.totalAmount,
			currency: imageExtracted.currency, supplierName: imageExtracted.supplierName,
			gstAmount: imageExtracted.gstAmount, poNumber: imageExtracted.poNumber,
			dueDate: imageExtracted.dueDate,
			confidence: imgConfidence,
			confidenceBand: imgConfidence >= 0.75 ? 'high' : 'medium',
			needsReview: imgConfidence < 0.75,
			validationWarnings: [],
			sourceSnippets: {}, extractionMethod: 'external_ocr', ocrProvider: ocrResult.provider,
			llmProvider: imageExtracted.llmProvider, promptVersion, rawText: imageText
		};
	}

	let rawText = '';
	let extractionMethod: OcrPipelineExtract['extractionMethod'];
	let ocrProvider: OcrPipelineExtract['ocrProvider'];

	// Use client-provided text when available (browser pdfjs-dist extraction is more accurate)
	if (opts?.rawTextOverride && opts.rawTextOverride.trim().length > 0) {
		rawText = opts.rawTextOverride.trim();
		extractionMethod = isPdf ? 'pdf_text' : isDocx ? 'docx_text' : 'pdf_text';
		ocrProvider = isPdf ? 'builtin_pdf' : isDocx ? 'docx_native' : 'builtin_pdf';
	} else if (isPdf) {
		rawText = extractPdfText(bytes);
		extractionMethod = 'pdf_text';
		ocrProvider = 'builtin_pdf';
	} else if (isDocx) {
		rawText = extractDocxText(bytes);
		extractionMethod = 'docx_text';
		ocrProvider = 'docx_native';
	} else {
		rawText = extractPdfText(bytes);
		extractionMethod = 'pdf_text';
		ocrProvider = 'builtin_pdf';
	}

	const validationWarnings: string[] = [];
	const textLen = rawText.trim().length;
	const hasGoodText = textLen > 100;

	if (!hasGoodText) {
		validationWarnings.push('Extracted text is very short; this may be a scanned PDF without a text layer.');
		return {
			documentDate: null,
			totalAmount: null,
			currency: null,
			supplierName: null,
			gstAmount: null,
			poNumber: null,
			dueDate: null,
			confidence: 0.15,
			confidenceBand: 'low',
			needsReview: true,
			validationWarnings,
			sourceSnippets: {},
			extractionMethod,
			ocrProvider,
			llmProvider: 'heuristic',
			promptVersion,
			rawText
		};
	}

	const extracted = await extractStructuredDocumentFields(rawText, {
		llmProvider: 'external',
		promptVersion,
		env
	});

	const llmDidWork = extracted.llmProvider !== 'heuristic';
	const confidence = llmDidWork ? 0.85 : 0.55;
	const confidenceBand: OcrPipelineExtract['confidenceBand'] = confidence >= 0.75 ? 'high' : 'medium';

	return {
		documentDate: extracted.documentDate,
		totalAmount: extracted.totalAmount,
		currency: extracted.currency,
		supplierName: extracted.supplierName,
		gstAmount: extracted.gstAmount,
		poNumber: extracted.poNumber,
		dueDate: extracted.dueDate,
		confidence,
		confidenceBand,
		needsReview: confidence < 0.75,
		validationWarnings,
		sourceSnippets: {},
		extractionMethod,
		ocrProvider,
		llmProvider: extracted.llmProvider,
		promptVersion,
		rawText
	};
}
