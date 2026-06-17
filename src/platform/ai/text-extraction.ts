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
import { runOcrSpaceOcr } from './ocr/ocrspace-ocr';
import type { FileServiceContract } from '../files/file.types';
import { pickMockFixtureText } from './text-extraction-fixtures';
import {
	tryExtractDocxPlainText,
	looksLikeLegacyWordDoc,
	looksLikeZip
} from '../files/docx/extract-plain-text';
import { parseEmlStructured } from '../files/eml/parse-eml';
import { composeEmlText } from '../files/eml/compose-eml-extraction';

/**
 * Image text-extraction route, picked per-upload in the AI Panel:
 *   - `vision_openai`      — vision LLM via the external AI API (OpenAI). Default.
 *   - `vision_workers_ai`  — vision LLM via Cloudflare Workers AI binding.
 *   - `ocr_api`            — external OCR.space API (`runOcrSpaceOcr`).
 * Only affects images — PDF/DOCX/EML paths ignore it. Legacy `'vision_ai'`
 * messages are treated as `vision_openai`.
 */
export type OcrStrategy = 'vision_openai' | 'vision_workers_ai' | 'ocr_api';

export interface PlatformTextExtractionResult {
	method: 'pdf_text' | 'vision_model' | 'ocr' | 'manual';
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
	/**
	 * Image OCR route. Defaults to `vision_ai`. When `ocr_api`, image files are
	 * sent to OCR.space instead of the vision LLM. Ignored for non-image inputs.
	 */
	ocrStrategy?: OcrStrategy;
	/**
	 * Optional category-guided vision prompt (VisionAI "field" extraction mode).
	 * When present AND the input is an image on a vision route, the vision model
	 * is steered to find the category's fields and emit a focused Markdown
	 * transcription instead of the generic verbatim prompt. Built finance-side
	 * (category-aware) and injected by the composition root — the platform layer
	 * stays category-agnostic. Ignored for the OCR.space route and non-images.
	 */
	visionPrompt?: { system: string; user: string };
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
	env: Env,
	ocrStrategy: OcrStrategy = 'vision_openai',
	visionPrompt?: { system: string; user: string }
): Promise<PlatformTextExtractionResult> {
	if (isPdfMime(mimeType, fileName)) {
		// Server-originated PDFs (no browser pdfjs text — e.g. Lark / email intake):
		// OCR.space parses PDFs natively (renders + OCRs the pages), which is far
		// better than the byte heuristic below. Use it when configured; the
		// heuristic stays as a last-resort fallback.
		if (readEnv(env, 'OCR_SPACE_API_KEY')) {
			const ocr = await runOcrSpaceOcr(env, { imageBytes: bytes, mimeType, fileName: fileName ?? '' });
			if (ocr.ok) {
				const partial = ocr.exitCode === 2;
				return {
					method: 'ocr',
					status: partial ? 'partial' : 'success',
					text: ocr.text,
					confidence: partial ? 0.55 : 0.8,
					provider: 'ocr_space',
					providerJobId: `ocrspace_engine_${ocr.engine}`
				};
			}
			// else fall through to the heuristic (e.g. >1MB free-tier reject)
		}

		// DEPRECATED Ship 1: this byte-heuristic only "works" on PDFs whose text
		// streams are uncompressed plain ASCII (extremely rare). For modern PDFs
		// the bytes are mostly compressed Flate streams + structural keywords,
		// so this path produces garbage that breaks downstream classification.
		//
		// The canonical PDF text path is the browser pdfjs extractor in
		// src/app/ai-panel/.../UploadStep.svelte (and intake/DropZone.svelte);
		// AI-Panel callers pass `clientExtractedText` to processDocument().
		//
		// Kept here as a last-resort fallback so other upload sources don't crash,
		// but it will mark the artifact as needs_manual_review for any non-trivial PDF.
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
		// OCR API route (OCR.space) — alternative to the vision LLM. Downstream
		// classification + field extraction are identical; only the transcription
		// engine differs.
		if (ocrStrategy === 'ocr_api') {
			const ocr = await runOcrSpaceOcr(env, { imageBytes: bytes, mimeType, fileName: fileName ?? '' });
			if (!ocr.ok) {
				return buildFailure('ocr_api_failed', ocr.error, 'ocr');
			}
			// OCRExitCode 2 = partial success (some pages/regions failed). Flag it as
			// partial + lower confidence rather than presenting truncated text as a
			// clean read — common when a raw, low-res, or mis-typed file slips in.
			const partial = ocr.exitCode === 2;
			return {
				method: 'ocr',
				status: partial ? 'partial' : 'success',
				text: ocr.text,
				confidence: partial ? 0.55 : 0.85,
				provider: 'ocr_space',
				providerJobId: `ocrspace_engine_${ocr.engine}`
			};
		}

		// Vision route: force the provider the user picked (External API vs
		// Workers AI) so the comparison is honest. `vision_workers_ai` → Workers
		// AI binding; anything else (vision_openai / legacy vision_ai) → OpenAI.
		const visionProvider = ocrStrategy === 'vision_workers_ai' ? 'workers_ai' : 'openai';
		const result = await runImageDocumentOcr(
			env,
			{ imageBytes: bytes, mimeType, fileName: fileName ?? '' },
			{ provider: visionProvider, promptOverride: visionPrompt }
		);
		if (!result.ok) {
			return buildFailure('vision_failed', result.error, 'vision_model');
		}
		return {
			method: 'vision_model',
			status: 'success',
			text: result.text,
			confidence: result.provider === 'openai' ? 0.9 : 0.85,
			provider: visionPrompt
				? `${result.provider}_field`
				: result.provider,
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

	const ocrStrategy = input.ocrStrategy ?? 'vision_openai';

	// Image path: fall back to mock when the chosen engine is unavailable in
	// local dev — Workers AI vision needs the AI binding, External API vision
	// needs the OpenAI key, OCR API needs the OCR.space key. Avoids stranding
	// image uploads when the picked engine is not configured.
	if (isImageMime(fileRef.mimeType, fileRef.fileName)) {
		const openaiKey = readEnv(env, 'OPENAI_API_KEY') || readEnv(env, 'LLM_API_KEY');
		const visionWorkersUnavailable = ocrStrategy === 'vision_workers_ai' && !env.AI;
		const visionOpenaiUnavailable = ocrStrategy === 'vision_openai' && !openaiKey;
		const ocrApiUnavailable = ocrStrategy === 'ocr_api' && !readEnv(env, 'OCR_SPACE_API_KEY');
		if (visionWorkersUnavailable || visionOpenaiUnavailable || ocrApiUnavailable) {
			return buildMockResult(input);
		}
	}

	const bytes = await fileService.getBytes(fileRef.key);
	if (!bytes) return buildFailure('blob_not_found', `No object at ${fileRef.key}`, 'pdf_text');

	// The category-guided vision prompt only applies to images on a vision route.
	const visionPrompt =
		ocrStrategy !== 'ocr_api' && isImageMime(fileRef.mimeType, fileRef.fileName)
			? input.visionPrompt
			: undefined;

	return extractTextFromBytesRaw(bytes, fileRef.mimeType, fileRef.fileName, env, ocrStrategy, visionPrompt);
}

