import { z } from 'zod';

export const expenseRecordSchema = z
	.object({
		id: z.string().optional(),
		projectId: z.string().nullable().optional(),
		amount: z.number().finite().optional(),
		sgdEquivalent: z.number().finite().optional(),
		currency: z.string().min(1).optional(),
		expenseType: z.enum(['opex', 'sales_cost']).optional(),
		date: z.string().optional()
	})
	.passthrough();

export type ExpenseRecordInput = z.infer<typeof expenseRecordSchema>;
