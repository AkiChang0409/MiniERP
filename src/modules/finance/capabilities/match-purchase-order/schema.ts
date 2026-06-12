import { z } from 'zod';

/** Agent-facing input contract for `finance.match-purchase-order`. */
export const matchPurchaseOrderInputSchema = z.object({
	supplierId: z.string().optional(),
	supplierName: z.string().optional(),
	totalAmount: z.number().optional(),
	currency: z.string().optional()
});
