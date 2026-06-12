import { z } from 'zod';

/** No required args; an optional leaveTypeId filter is accepted. */
export const listPendingLeaveInputSchema = z.object({
	leaveTypeId: z.string().optional()
});
export type ListPendingLeaveInput = z.infer<typeof listPendingLeaveInputSchema>;

const pendingLeaveRow = z.object({
	id: z.string(),
	personId: z.string(),
	personName: z.string().nullable(),
	leaveTypeName: z.string().nullable(),
	startDate: z.string(),
	endDate: z.string(),
	totalDays: z.number(),
	status: z.string()
});

export const listPendingLeaveOutputSchema = z.object({
	count: z.number(),
	requests: z.array(pendingLeaveRow)
});
export type ListPendingLeaveOutput = z.infer<typeof listPendingLeaveOutputSchema>;
