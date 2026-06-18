import { z } from 'zod';

/** Mirrors the `expenses.create` service input (expense-service.ts). */
export const createExpenseRecordInputSchema = z.object({
	projectId: z.string().nullable().optional(),
	expenseType: z.enum(['opex', 'sales_cost']),
	category: z.string(),
	amount: z.number(),
	currency: z.string(),
	date: z.string(),
	vendorOrSupplier: z.string().nullable().optional(),
	staffName: z.string().nullable().optional(),
	reimbursement: z.boolean().optional(),
	businessTrip: z.boolean().optional(),
	destination: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
	metadata: z.string().nullable().optional(),
	documentRef: z.string().nullable().optional(),
	docType: z.enum(['invoice', 'receipt', 'po']).nullable().optional(),
	gstAmount: z.number().nullable().optional()
});

export type CreateExpenseRecordInput = z.infer<typeof createExpenseRecordInputSchema>;

export interface CreateExpenseRecordOutput {
	id: string;
}
