/**
 * Text extraction abstraction (Phase 2).
 *
 * Hides three concrete OCR / parse paths behind a single function so
 * Document Intake's `processDocument` doesn't care whether the file was a
 * PDF with a text layer, a scanned image, or 鈥?when running offline /
 * without an AI binding 鈥?a mock fixture.
 *
 * Output shape is platform-owned and structurally compatible with
 * document-intake artifacts. Callers persist this directly into the artifact.
 */
import { runImageDocumentOcr } from './ocr/image-document-ocr';
import type { FileServiceContract } from '../files/file.types';
import { pickMockFixtureText } from './text-extraction-fixtures';
import {
	tryExtractDocxPlainText,
	looksLikeLegacyWordDoc,
	looksLikeZip
} from '../files/docx/extract-plain-text';
import { parseEmlStructured } from '../files/eml/parse-eml';
import { composeEmlText } from '../files/eml/compose-eml-extraction';

export interface PlatformTextExtractionResult {
	method: 'pdf_text' | 'vision_model' | 'manual';
	status: 'success' | 'partial' | 'failed';
	text?: string;
	confidence?: number;
	language?: string;
	provider?: string;
	providerJobId?: string;
	error?: {
		code: string;
		message: string;
	};
}

export interface ExtractTextInput {
	fileRef: {
		key: string;
		mimeType: string;
		fileName?: string;
		sizeBytes?: number;
	};
	fileService: FileServiceContract;
	env: Env;
	/**
	 * Force the mock branch. Useful for local dev without a Workers AI binding
	 * and for the scratch verification drivers.
	 */
	useMock?: boolean;
}

const PDF_BYTE_READ_LIMIT = 50_000;
const MIN_USEFUL_PDF_TEXT = 48;

function readEnv(platformEnv: Env, key: string): string {
	const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
	const fromPlatform = (platformEnv as unknown as Record<string, unknown>)[key];
	if (typeof fromPlatform === 'string' && fromPlatform.trim()) return fromPlatform.trim();
	const fromProcess = processEnv?.[key];
	return typeof fromProcess === 'string' ? fromProcess.trim() : '';
}

function decodePdfHeuristicBytes(bytes: Uint8Array): string {
	const slice = bytes.byteLength > PDF_BYTE_READ_LIMIT ? bytes.slice(0, PDF_BYTE_READ_LIMIT) : bytes;
	const decoder = new TextDecoder('utf-8', { fatal: false });
	return decoder
		.decode(slice)
		.replace(/\u0000/g, ' ')
		.replace(/\ufffd+/g, ' ')
		.replace(/\s{4,}/g, '   ')
		.trim();
}

function isPdfMime(mime: string, fileName?: string): boolean {
	if (mime.toLowerCase().includes('pdf')) return true;
	return Boolean(fileName?.toLowerCase().endsWith('.pdf'));
}

function isImageMime(mime: string, fileName?: string): boolean {
	if (mime.toLowerCase().startsWith('image/')) return true;
	return Boolean(fileName && /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(fileName));
}

function isDocxOrDocMime(mime: string, fileName?: string): boolean {
	const m = mime.toLowerCase();
	const n = (fileName || '').toLowerCase();
	return (
		m.includes('wordprocessingml.document') ||
		m === 'application/msword' ||
		/\.docx$/i.test(n) ||
		(/\.doc$/i.test(n) && !/\.docx$/i.test(n))
	);
}

function isEmlMime(mime: string, fileName?: string): boolean {
	const m = mime.toLowerCase();
	const n = (fileName || '').toLowerCase();
	return m === 'message/rfc822' || n.endsWith('.eml');
}

function buildMockResult(input: ExtractTextInput): PlatformTextExtractionResult {
	const fixture = pickMockFixtureText({
		fileName: input.fileRef.fileName,
		key: input.fileRef.key
	});
	return {
		method: 'manual',
		status: 'success',
		text: fixture.text,
		confidence: fixture.confidence,
		provider: 'mock-v1',
		language: 'en'
	};
}

function buildFailure(
	code: string,
	message: string,
	method: PlatformTextExtractionResult['method']
): PlatformTextExtractionResult {
	return {
		method,
		status: 'failed',
		error: { code, message }
	};
}

/**
 * Core byte-level text extraction — the canonical single implementation.
 *
 * Called by both `extractTextFromBlob` (R2-backed files) and the EML pipeline
 * (in-memory attachment bytes). Any new format support belongs here.
 *
 * Does NOT handle EML — that format wraps other documents and is handled a
 * level up in `extractTextFromBlob` / `composeEmlText`.
 */
export async function extractTextFromBytesRaw(
	bytes: Uint8Array,
	mimeType: string,
	fileName: string | undefined,
	env: Env
): Promise<PlatformTextExtractionResult> {
	if (isPdfMime(mimeType, fileName)) {
		// DEPRECATED Ship 1: this byte-heuristic only "works" on PDFs whose text
		// streams are uncompressed plain ASCII (extremely rare). For modern PDFs
		// the bytes are mostly compressed Flate streams + structural keywords,
		// so this path produces garbage that breaks downstream classification.
		//
		// The canonical PDF text path is now the browser pdfjs extractor in
		// src/app/ai-panel/.../UploadStep.svelte (and intake/DropZone.svelte).
		// Server callers should pass `clientExtractedText` to processDocument()
		// rather than relying on this.
		//
		// Kept here as a last-resort fallback so non-AI-Panel upload sources
		// (e.g. future email intake) don't crash, but it will mark the artifact
		// as needs_manual_review for any non-trivial PDF.
		const text = decodePdfHeuristicBytes(bytes);
		const hasWordLikeAscii = /[A-Za-z]{4,}/.test(
			text.replace(/\bobj\b|\bendobj\b|\bstream\b|\bendstream\b|\bxref\b/g, '')
		);
		if (text.length >= MIN_USEFUL_PDF_TEXT && hasWordLikeAscii) {
			return {
				method: 'pdf_text',
				status: 'success',
				text,
				confidence: 0.5,
				provider: 'builtin_pdf_legacy'
			};
		}
		return {
			method: 'pdf_text',
			status: 'partial',
			text,
			confidence: 0.1,
			provider: 'builtin_pdf_legacy',
			error: {
				code: 'low_text_yield',
				message:
					'Server-side PDF heuristic could not extract usable text. Use the AI Panel upload (browser pdfjs) for PDFs.'
			}
		};
	}

	if (isImageMime(mimeType, fileName)) {
		const result = await runImageDocumentOcr(env, { imageBytes: bytes, mimeType, fileName: fileName ?? '' });
		if (!result.ok) {
			return buildFailure('vision_failed', result.error, 'vision_model');
		}
		return {
			method: 'vision_model',
			status: 'success',
			text: result.text,
			confidence: result.provider === 'openai' ? 0.9 : 0.85,
			provider: result.provider,
			providerJobId: result.provider === 'openai' ? readEnv(env, 'OPENAI_VISION_MODEL') || 'gpt-4o-mini' : undefined
		};
	}

	if (isDocxOrDocMime(mimeType, fileName)) {
		const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

		// Legacy Word 97–2003 binary compound document — cannot parse without OLE library
		if (looksLikeLegacyWordDoc(ab) && !looksLikeZip(ab)) {
			return {
				method: 'manual',
				status: 'partial',
				confidence: 0,
				provider: 'docx_xml_parse',
				error: {
					code: 'legacy_doc_unsupported',
					message:
						'Legacy .doc (Word 97–2003) binary format cannot be parsed automatically. Please save as .docx and re-upload.'
				}
			};
		}

		const text = tryExtractDocxPlainText(ab);
		if (text && text.length >= MIN_USEFUL_PDF_TEXT) {
			return {
				method: 'manual',
				status: 'success',
				text,
				confidence: 0.9,
				provider: 'docx_xml_parse'
			};
		}
		return {
			method: 'manual',
			status: 'partial',
			text: text ?? '',
			confidence: 0.1,
			provider: 'docx_xml_parse',
			error: {
				code: 'low_text_yield',
				message: 'Could not extract usable text from this Word document.'
			}
		};
	}

	return buildFailure(
		'unsupported_format',
		`MIME type ${mimeType || 'unknown'} is not supported by Phase 2 extraction.`,
		'manual'
	);
}

/**
 * Run text extraction. Phase 2 supports three paths:
 *  - PDF with a text layer (heuristic byte decode — same approach as the
 *    existing `$platform/ai/ocr/pipeline.ts:extractPdfText`).
 *  - Image (server image OCR, configured by `OCR_IMAGE_PROVIDER`).
 *  - Mock fixture (filename keyword lookup) when caller opts in or when the
 *    AI binding is missing.
 *
 * Scanned PDFs fall through to `needs_manual_review` in Phase 2; rasterized
 * page-1 vision fallback lands in Phase 4 alongside async processing.
 */
export async function extractTextFromBlob(
	input: ExtractTextInput
): Promise<PlatformTextExtractionResult> {
	const { fileRef, fileService, env } = input;

	if (input.useMock) {
		return buildMockResult(input);
	}

	if (isEmlMime(fileRef.mimeType, fileRef.fileName)) {
		const bytes = await fileService.getBytes(fileRef.key);
		if (!bytes) return buildFailure('blob_not_found', `No object at ${fileRef.key}`, 'manual');
		const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
		const structured = parseEmlStructured(raw);
		// composeEmlText routes attachments via LLM (falling back to keyword
		// scoring), extracts each selected attachment via extractTextFromBytesRaw,
		// and prepends the cleaned email body as navigation context.
		const text = await composeEmlText(structured, env);
		if (text.length >= MIN_USEFUL_PDF_TEXT) {
			return {
				method: 'manual',
				status: 'success',
				text,
				confidence: 0.85,
				provider: 'eml_mime_parse'
			};
		}
		return buildFailure(
			'low_text_yield',
			'EML file appears to be empty or has no readable text content.',
			'manual'
		);
	}

	// Image path: fall back to mock when AI binding is absent (local dev).
	if (isImageMime(fileRef.mimeType, fileRef.fileName) && !env.AI) {
		return buildMockResult(input);
	}

	const bytes = await fileService.getBytes(fileRef.key);
	if (!bytes) return buildFailure('blob_not_found', `No object at ${fileRef.key}`, 'pdf_text');

	return extractTextFromBytesRaw(bytes, fileRef.mimeType, fileRef.fileName, env);
}

