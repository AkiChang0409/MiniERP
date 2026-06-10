import { z } from 'zod';

export const approveLeaveRequestInputSchema = z.object({
	leaveRequestId: z.string().min(1, 'leaveRequestId is required'),
	comment: z.string().optional()
});
export type ApproveLeaveRequestInput = z.infer<typeof approveLeaveRequestInputSchema>;

export const approveLeaveRequestOutputSchema = z.object({
	approved: z.boolean(),
	leaveRequestId: z.string()
});
export type ApproveLeaveRequestOutput = z.infer<typeof approveLeaveRequestOutputSchema>;
