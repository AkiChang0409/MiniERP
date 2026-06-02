import type { RequestHandler } from './$types';

import { fail, ok } from '$platform/http';
import { runOcrPipeline } from '$platform/ai/ocr/pipeline';
import { extractDocHubFields, type DocHubDocType } from '$platform/ai/ocr/doc-hub-extract';

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform) return fail('Cloudflare platform bindings are required', 500);

	const formData = await request.formData();
	const file = formData.get('file');
	if (!(file instanceof File)) return fail('file is required', 400);

	const docTypeRaw = String(formData.get('docType') || 'contract');
	const allowed = new Set(['contract', 'quotation', 'purchase_order']);
	if (!allowed.has(docTypeRaw)) {
		return fail('Unsupported docType for doc hub detect', 400);
	}
	const docType = docTypeRaw as DocHubDocType;

	const bytes = await file.arrayBuffer();
	const fileType = file.type || 'application/octet-stream';
	const clientRawText = String(formData.get('rawText') || '');

	// Image files with no client-provided text: return "pending" stub
	// (client should have already run image OCR and passed rawText)
	const isImage = /^image\//i.test(fileType) || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(file.name.toLowerCase());
	if (isImage && !clientRawText) {
		return ok({
			rawText: '',
			confidence: 0,
			confidenceBand: 'low',
			isImageFile: true,
			message: 'Image file: OCR for images is not available yet.',
			baseExtract: null,
			extracted: null
		});
	}

	let pipeline: Awaited<ReturnType<typeof runOcrPipeline>>;
	try {
		pipeline = await runOcrPipeline(fileType, bytes, platform.env, {
			fileName: file.name,
			rawTextOverride: clientRawText || undefined
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		const stack = e instanceof Error ? e.stack : '';
		return fail(`Document extraction failed: ${message}`, 500, {
			message,
			stack: stack?.slice(0, 1500) ?? '',
			fileType: fileType,
			fileName: file.name
		});
	}

	// Second pass: doc-type-specific LLM extraction (only when we have usable text)
	let extracted: Awaited<ReturnType<typeof extractDocHubFields>> | null = null;
	if (pipeline.rawText && pipeline.rawText.trim().length > 50) {
		try {
			extracted = await extractDocHubFields(pipeline.rawText, docType, platform.env);
		} catch {
			// Non-fatal: extraction failed, extracted stays null, UI falls back to manual fill
		}
	}

	return ok({
		rawText: pipeline.rawText || '',
		confidence: Math.round((pipeline.confidence || 0) * 100),
		confidenceBand: pipeline.confidenceBand,
		isImageFile: false,
		message: pipeline.validationWarnings.length > 0 ? pipeline.validationWarnings.join('; ') : null,
		baseExtract: {
			documentDate: pipeline.documentDate,
			totalAmount: pipeline.totalAmount,
			currency: pipeline.currency,
			supplierName: pipeline.supplierName,
			dueDate: pipeline.dueDate,
			poNumber: pipeline.poNumber
		},
		extracted
	});
};


