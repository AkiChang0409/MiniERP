/**
 * Run the document-intake pipeline (OCR/text → classify → field-extract) for a
 * stored artifact, injecting the finance capabilities as the classifier +
 * extractor. Mirrors the inline composition in `POST /api/documents`
 * (`processInlineFallback`) but is callable from any ModuleContext — used by the
 * Lark conversational flow after the user picks a project.
 *
 * App layer: composes document-intake + finance module surfaces (the boundary
 * linter exempts `src/app/`). Returns the processed artifact
 * (`processingStatus === 'ready_for_review'` on success).
 */
import type { ModuleContext } from '$platform/modules/types';
import { createDocumentIntakeService, type DocumentArtifact } from '$modules/document-intake';
import {
	classifyDocumentCategoryCapability,
	extractDocumentFieldsCapability,
	categoryIdForDocumentType
} from '$modules/finance';

export async function processIntakeDocument(
	ctx: ModuleContext,
	documentId: string,
	opts: { ocrStrategy?: 'ocr_api' | 'vision_openai' | 'vision_workers_ai' } = {}
): Promise<DocumentArtifact> {
	const env = ctx.env;
	const userId = ctx.user?.id ?? '';
	const intake = createDocumentIntakeService({ db: ctx.db, env, user: ctx.user });

	return intake.processDocument({
		tenantId: 'default',
		documentId,
		ocrStrategy: opts.ocrStrategy ?? 'ocr_api',
		categoryClassifier: async ({ tenantId, documentId: docId, fileName, text }) => {
			const r = await classifyDocumentCategoryCapability.execute(
				{ documentId: docId, fileName, text },
				{ tenantId, userId, env, useMock: !env.AI }
			);
			return {
				categoryId: r.categoryId,
				confidence: r.confidence,
				documentType: r.documentType,
				possibleTypes: r.possibleTypes,
				reason: r.reason
			};
		},
		fieldExtractor: async ({
			tenantId,
			documentId: docId,
			fileName,
			text,
			documentType,
			classificationConfidence,
			categoryId: classifiedCategoryId
		}) => {
			const categoryId =
				classifiedCategoryId ?? categoryIdForDocumentType(documentType ?? 'unknown');
			if (!categoryId) return null;
			if (classificationConfidence < 0.4) return null;

			const result = await extractDocumentFieldsCapability.execute(
				{ documentId: docId, fileName, text, categoryId, artifactConfidence: classificationConfidence },
				{ tenantId, userId, env, useMock: !env.AI }
			);
			return {
				fields: result.fields as unknown as Record<string, unknown>,
				confidence: result.fieldConfidence,
				evidence: result.evidence,
				sourceQuotes: result.sourceQuotes,
				fieldCandidates: result.fieldCandidates,
				categoryId
			};
		}
	});
}
