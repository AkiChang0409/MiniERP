import { z } from 'zod';

/** Mirrors the `revenue.createRevenue` service input (revenue-service.ts). */
export const createRevenueRecordInputSchema = z.object({
	projectId: z.string().nullable().optional(),
	invoiceType: z.enum(['standard', 'zero_rate', 'tax_invoice', 'exempt', 'out_of_scope']),
	invoiceNumber: z.string().nullable().optional(),
	clientName: z.string().nullable().optional(),
	date: z.string(),
	amount: z.number(),
	currency: z.string().optional(),
	gstAmount: z.number().optional(),
	gstCode: z.enum(['SR', 'ZR', 'ES', 'OP']).nullable().optional(),
	documentRef: z.string().nullable().optional(),
	metadata: z.string().nullable().optional(),
	notes: z.string().nullable().optional()
});

export type CreateRevenueRecordInput = z.infer<typeof createRevenueRecordInputSchema>;

export interface CreateRevenueRecordOutput {
	id: string;
}
