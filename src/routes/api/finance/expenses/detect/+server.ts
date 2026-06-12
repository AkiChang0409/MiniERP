import type { RequestHandler } from './$types';

import { fail, ok } from '$platform/http';
import { runOcrPipeline } from '$platform/ai/ocr/pipeline';
import { detectExpenseFieldsFromOcr } from '$platform/ai/ocr/expense-detection';
import {
	CATEGORY_DOC_TYPE_MAP,
	EXPENSE_CATEGORY_OPTIONS,
	isValidExpenseCategory,
	type ExpenseCategory,
	type ExpenseType
} from '$modules/finance/domain/expense-upload';

/**
 * POST /api/expenses/detect
 *
 * Runs OCR + structured extraction on the uploaded file **without** persisting
 * R2 / documents / expenses. Used by the expense upload UI as an optional
 * pre-submit step to suggest form values.
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform) {
		return fail('Cloudflare platform bindings are required', 500);
	}

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File) || file.size === 0) {
		return fail('Missing or empty file field "file"', 400);
	}
	const expenseTypeRaw = String(form.get('expenseType') || 'opex');
	const categoryRaw = String(form.get('category') || '');
	const docTypeRaw = String(form.get('docType') || '');

	const expenseType: ExpenseType = expenseTypeRaw === 'sales_cost' ? 'sales_cost' : 'opex';
	const fallbackCategory = EXPENSE_CATEGORY_OPTIONS[expenseType][0] as ExpenseCategory;
	const category = isValidExpenseCategory(expenseType, categoryRaw)
		? (categoryRaw as ExpenseCategory)
		: fallbackCategory;
	const docType = (docTypeRaw || CATEGORY_DOC_TYPE_MAP[category] || null) as
		| 'invoice'
		| 'receipt'
		| 'po'
		| null;

	const bytes = await file.arrayBuffer();
	const fileType = file.type || 'application/octet-stream';
	const clientRawText = String(form.get('rawText') || '');

	let extracted: Awaited<ReturnType<typeof runOcrPipeline>>;
	try {
		extracted = await runOcrPipeline(fileType, bytes, platform.env, {
			fileName: file.name,
			rawTextOverride: clientRawText || undefined
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		const stack = e instanceof Error ? e.stack : '';
		return fail(`OCR pipeline failed: ${message}`, 500, {
			message,
			stack: stack?.slice(0, 1500) ?? '',
			fileType,
			fileSize: bytes.byteLength,
			env: {
				PADDLE_OCR_URL: platform.env.PADDLE_OCR_URL ?? 'undefined',
				OCR_PROVIDER: platform.env.OCR_PROVIDER ?? 'undefined'
			},
			context: { expenseType: expenseTypeRaw, category: categoryRaw }
		});
	}

	let detect: Awaited<ReturnType<typeof detectExpenseFieldsFromOcr>>;
	try {
		detect = await detectExpenseFieldsFromOcr(
			{
				expenseType,
				category,
				docType
			},
			extracted,
			platform.env
		);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		const stack = e instanceof Error ? e.stack : '';
		return fail(`LLM extraction failed: ${message}`, 500, {
			message,
			stack: stack?.slice(0, 1500) ?? '',
			ocrExtracted: extracted,
			context: { expenseType, category, docType }
		});
	}

	return ok({
		fileName: file.name,
		fileType,
		ocr: {
			extractionMethod: extracted.extractionMethod,
			ocrProvider: extracted.ocrProvider,
			llmProvider: extracted.llmProvider,
			warnings: extracted.validationWarnings ?? []
		},
		context: {
			expenseType,
			category,
			docType
		},
		suggestions: detect.suggestions,
		metaHints: detect.metadataHints,
		confidence: detect.confidence,
		provider: detect.provider,
		fieldSpecs: detect.fieldSpecs,
		extracted: detect.extracted,
		rawTextPreview: extracted.rawText?.slice(0, 8000) ?? '',
		rawTextLength: extracted.rawText?.length ?? 0
	});
};

