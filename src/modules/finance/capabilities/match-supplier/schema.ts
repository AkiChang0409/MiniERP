import { z } from 'zod';

/** Agent-facing input contract for `finance.match-supplier`. */
export const matchSupplierInputSchema = z.object({
	counterpartyName: z.string().optional()
});
