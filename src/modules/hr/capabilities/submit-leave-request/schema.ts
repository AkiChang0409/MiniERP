import { z } from 'zod';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/**
 * NOTE: there is intentionally NO `personId` field. The employee a request is
 * filed for is resolved server-side from the bound login user; accepting a
 * personId here would let one employee file leave for another.
 */
export const submitLeaveRequestInputSchema = z.object({
	leaveTypeId: z.string().min(1, 'leaveTypeId is required'),
	startDate: z.string().regex(isoDate, 'startDate must be YYYY-MM-DD'),
	endDate: z.string().regex(isoDate, 'endDate must be YYYY-MM-DD'),
	reason: z.string().optional()
});
export type SubmitLeaveRequestInput = z.infer<typeof submitLeaveRequestInputSchema>;

export const submitLeaveRequestOutputSchema = z.object({
	id: z.string(),
	totalDays: z.number(),
	status: z.string()
});
export type SubmitLeaveRequestOutput = z.infer<typeof submitLeaveRequestOutputSchema>;
