import type { RequestHandler } from './$types';

import { fail, ok } from '$platform/http';
import { getDb } from '../../../../../infrastructure/db';
import { createDocumentIntakeService } from '$modules/document-intake';
import {
	extractDocumentFieldsCapability,
	findCategoryById
} from '$modules/finance';

/**
 * POST /api/documents/[id]/reclassify
 *
 * Inbox-flow re-extract endpoint (Ship 2). User changed the category dropdown
 * in the inbox. We re-run the finance-side `extract-document-fields`
 * capability against the EXISTING `textExtraction.text` (no re-OCR, no
 * re-classify) using the new categoryId, and replace `suggestedFields`.
 *
 * Status stays `ready_for_review` — the artifact didn't change state, only
 * the AI's suggested fields did. Cheap operation: heuristic+LLM run only.
 *
 * Request body (JSON):
 *  - `categoryId` (required): the new category to extract against. Must be a
 *    valid id from FINANCE_CATEGORY_CATALOG.
 */
interface ReclassifyBody {
	categoryId: string;
}

export const POST: RequestHandler = async (event) => {
	if (!event.platform) return fail('Cloudflare platform bindings are required', 500);
	const user = event.locals.user;
	if (!user) return fail('Unauthorized', 401);

	const id = event.params.id;
	if (!id) return fail('Document id is required', 400);

	const body = (await event.request.json().catch(() => null)) as ReclassifyBody | null;
	if (!body?.categoryId || typeof body.categoryId !== 'string') {
		return fail('categoryId is required', 400);
	}

	const category = findCategoryById(body.categoryId);
	if (!category) return fail(`Unknown categoryId: ${body.categoryId}`, 400);

	const env = event.platform.env;
	const db = getDb(env);
	const intake = createDocumentIntakeService({ db, env, user });

	const artifact = await intake.getDocumentArtifact({ tenantId: 'default', documentId: id });
	if (!artifact) return fail('Document artifact not found', 404);

	if (artifact.processingStatus !== 'ready_for_review') {
		return fail(
			`Reclassify only valid in ready_for_review state. Current: ${artifact.processingStatus}.`,
			409
		);
	}

	const text = artifact.textExtraction?.text;
	if (!text || text.length < 32) {
		return fail(
			'Artifact has no usable extracted text — cannot re-extract. Re-upload may be required.',
			400
		);
	}

	const result = await extractDocumentFieldsCapability.execute(
		{
			documentId: artifact.id,
			fileName: artifact.originalFile.fileName,
			text,
			categoryId: body.categoryId,
			artifactConfidence: artifact.classification?.confidence
		},
		{
			tenantId: 'default',
			userId: user.id,
			env,
			useMock: !env.AI
		}
	);

	const updated = await intake.replaceSuggestedFields({
		tenantId: 'default',
		documentId: id,
		fields: result.fields as unknown as Record<string, unknown>,
		confidence: result.fieldConfidence,
		evidence: result.evidence,
		sourceQuotes: result.sourceQuotes,
		categoryId: body.categoryId
	});
	if (!updated) return fail('Reclassify failed', 500);

	return ok(intake.toView(updated));
};
