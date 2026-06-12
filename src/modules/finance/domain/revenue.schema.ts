import { z } from 'zod';

export const revenueRecordSchema = z
	.object({
		id: z.string().optional(),
		projectId: z.string().nullable().optional(),
		amount: z.number().finite().optional(),
		sgdEquivalent: z.number().finite().optional(),
		currency: z.string().min(1).optional(),
		date: z.string().optional()
	})
	.passthrough();

export type RevenueRecordInput = z.infer<typeof revenueRecordSchema>;
