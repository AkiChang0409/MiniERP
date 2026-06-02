import type { RequestHandler } from './$types';

import { fail, ok } from '$platform/http';
import { createDocumentIntakeService } from '$modules/document-intake';
import { getDb } from '../../../../../infrastructure/db';
import { inferFileInlinePreviewKind } from '$platform/files/file-inline-preview';

/**
 * GET /api/documents/[id]/intake
 *
 * Operator-only diagnostic view for the document-intake stage. Unlike the
 * generic document view, this intentionally includes the **full extracted
 * raw text** so operators can evaluate extraction quality before finance
 * analysis/review.
 *
 * Access control: gated to `owner` and `finance` roles. Raw OCR text can
 * contain PII (bank account numbers on statements, vendor pricing on
 * supplier invoices, salary figures on tax docs) — anyone with the
 * project_manager / employee role who can otherwise see the inbox should
 * see the structured `suggestedFields` instead, not the raw text dump.
 *
 * If/when multi-tenant lands (BaseLine 7 §5), this also needs an
 * artifact-owner check; for now the synthetic `tenantId: 'default'`
 * plus role gate is the operative boundary.
 */
const DIAGNOSTICS_ROLES = new Set(['owner', 'admin', 'finance']);

export const GET: RequestHandler = async (event) => {
	if (!event.platform) return fail('Cloudflare platform bindings are required', 500);
	const user = event.locals.user;
	if (!user) return fail('Unauthorized', 401);
	if (!user.roles.some((r) => DIAGNOSTICS_ROLES.has(r))) {
		return fail('Forbidden — diagnostics view is restricted to finance operators.', 403);
	}

	const id = event.params.id;
	if (!id) return fail('Document id is required', 400);

	const service = createDocumentIntakeService({
		db: getDb(event.platform.env),
		env: event.platform.env,
		user
	});

	const artifact = await service.getDocumentArtifact({ tenantId: 'default', documentId: id });
	if (!artifact) return fail('Document not found', 404);

	const text = artifact.textExtraction?.text ?? '';
	const fileViewUrl = `/api/documents/${encodeURIComponent(artifact.id)}/file`;
	return ok({
		id: artifact.id,
		processingStatus: artifact.processingStatus,
		documentType: artifact.documentType ?? 'unknown',
		originalFile: {
			fileName: artifact.originalFile.fileName,
			mimeType: artifact.originalFile.mimeType,
			sizeBytes: artifact.originalFile.sizeBytes
		},
		filePreview: {
			url: fileViewUrl,
			kind: inferFileInlinePreviewKind({
				fileViewUrl,
				fileNameHint: artifact.originalFile.fileName,
				storageKey: artifact.originalFile.storageRef,
				contentType: artifact.originalFile.mimeType
			})
		},
		textExtraction: artifact.textExtraction
			? {
					method: artifact.textExtraction.method,
					status: artifact.textExtraction.status,
					confidence: artifact.textExtraction.confidence,
					language: artifact.textExtraction.language,
					provider: artifact.textExtraction.provider,
					pageCount: artifact.textExtraction.pages?.length ?? null,
					textLength: text.length,
					rawText: text,
					error: artifact.textExtraction.error
				}
			: null,
		classification: artifact.classification ?? null,
		securityFlags: artifact.securityFlags ?? [],
		updatedAt: artifact.updatedAt
	});
};
