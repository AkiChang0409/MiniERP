import { z } from 'zod';

/** Agent-facing input contract for `finance.extract-document-fields`. */
export const extractDocumentFieldsInputSchema = z.object({
	documentId: z.string(),
	fileName: z.string().optional(),
	text: z.string().optional(),
	artifactConfidence: z.number().optional(),
	/** Category id from the workflow state, e.g. `expense.sales_cost.invoice`.
	 *  When absent the capability defaults to invoice extraction (Phase 2 behavior). */
	categoryId: z.string().optional(),
	/** Legacy finance workflow still expects documentNumber/counterpartyName. Inbox leaves this unset. */
	outputShape: z.enum(['category', 'legacy']).optional()
});
