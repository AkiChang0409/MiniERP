import type { RequestHandler } from '@sveltejs/kit';

import { fail, ok } from '$platform/http';
import { runOcrPipeline } from '$platform/ai/ocr/pipeline';
import { extractDocumentFieldsCapability } from '$modules/finance';

/**
 * POST /api/public/po/extract-quotation
 *
 * Public (no-login) companion to the /po/generate tool. Accepts a supplier
 * quotation / pro-forma file (PDF / image / docx), runs the shared OCR + LLM
 * extraction pipeline, and returns the variable PO fields (supplier, currency,
 * line items) so the generator can pre-fill them. Persists nothing.
 *
 * Category choice — `document_only.purchase_order` (not `quotation`): a received
 * quotation and a PO share the same commercial structure (issuer = supplier,
 * bill-to = us, itemised lines, totals). The PO extractor's field hints capture
 * the quote's issuer as `supplier_name` — which the `quotation` schema does not
 * expose (it only has `client_name` = the recipient). We never read `po_number`
 * here, so a quote number mis-guessed as a PO number can do no harm.
 *
 * NOTE: this endpoint is intentionally unauthenticated (see hooks.server.ts
 * `/api/public/` allowlist), so it exposes OCR + LLM inference — which consumes
 * AI quota — to anonymous callers. Acceptable for the current no-login PO tool;
 * revisit with a rate limit / shared token if abuse becomes a concern.
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
		return fail(`OCR pipeline failed: ${message}`, 500);
	}

	const rawText = extracted.rawText?.trim() ?? '';
	if (!rawText || rawText.length < 32) {
		return fail('No text could be extracted from this file. Try a clearer scan or a different file.', 400);
	}

	const documentId = `po-quote-${Date.now()}`;
	let result: Awaited<ReturnType<typeof extractDocumentFieldsCapability.execute>>;
	try {
		result = await extractDocumentFieldsCapability.execute(
			{
				documentId,
				fileName: file.name,
				text: rawText,
				categoryId: 'document_only.purchase_order',
				outputShape: 'category'
			},
			{
				tenantId: 'default',
				userId: 'system',
				env: platform.env
			}
		);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return fail(`Quotation field extraction failed: ${message}`, 500);
	}

	if (!result.fields || Object.keys(result.fields).length === 0) {
		return fail('Could not extract fields from this file. Try a clearer scan or enter fields manually.', 400);
	}

	const f = result.fields;
	const str = (v: unknown): string | null =>
		typeof v === 'string' && v.trim() ? v.trim() : null;
	const num = (v: unknown): number | null =>
		typeof v === 'number' && Number.isFinite(v) ? v : null;

	const rawLineItems = Array.isArray(f.line_items) ? f.line_items : [];
	const lineItems = rawLineItems
		.map((item: Record<string, unknown>) => ({
			description: str(item.description) ?? '',
			unit: num(item.qty) ?? 1,
			unitPrice: num(item.unitPrice) ?? num(item.amount) ?? 0
		}))
		// Drop rows the LLM emitted with no usable content.
		.filter((row) => row.description || row.unitPrice > 0);

	return ok({
		fileName: file.name,
		provider: result.provider,
		confidence: result.confidence,
		suggestions: {
			supplierName: str(f.supplier_name) ?? null,
			currency: str(f.currency) ?? null,
			quotationDate: str(f.date) ?? null,
			description: str(f.description) ?? null,
			lineItems
		}
	});
};
