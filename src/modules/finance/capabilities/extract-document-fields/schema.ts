import { z } from 'zod';

/** Agent-facing input contract for `finance.extract-document-fields`. */
export const extractDocumentFieldsInputSchema = z.object({
	documentId: z.string(),
	fileName: z.string().optional(),
	text: z.string().optional(),
	artifactConfidence: z.number().optional(),
	categoryId: z.string().optional(),
	outputShape: z.enum(['category', 'legacy']).optional()
});
