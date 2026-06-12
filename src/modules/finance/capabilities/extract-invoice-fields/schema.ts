import { z } from 'zod';

/** Agent-facing input contract for `finance.extract-invoice-fields`. */
export const extractInvoiceFieldsInputSchema = z.object({
	documentId: z.string(),
	fileName: z.string().optional(),
	text: z.string().optional(),
	artifactConfidence: z.number().optional()
});
