import { z } from 'zod';

/** Agent-facing input contract for `finance.suggest-next-finance-task`. */
export const suggestNextTaskInputSchema = z.object({
	afterWorkflowId: z.string().optional(),
	afterSupplierName: z.string().optional()
});
