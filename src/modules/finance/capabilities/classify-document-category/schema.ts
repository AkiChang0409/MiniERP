import { z } from 'zod';

/** Agent-facing input contract for `finance.classify-document-category`. */
export const classifyDocumentCategoryInputSchema = z.object({
	documentId: z.string(),
	fileName: z.string().optional(),
	text: z.string().optional()
});
