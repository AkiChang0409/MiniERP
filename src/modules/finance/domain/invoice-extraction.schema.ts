import { z } from 'zod';

export const invoiceExtractionSchema = z
	.object({
		documentNumber: z.string().optional(),
		counterpartyName: z.string().optional(),
		currency: z.string().min(1).optional(),
		totalAmount: z.number().finite().optional(),
		issueDate: z.string().optional(),
		dueDate: z.string().optional()
	})
	.passthrough();

export type InvoiceExtractionInput = z.infer<typeof invoiceExtractionSchema>;
