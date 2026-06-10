import { createLeaveApi } from '../../leave-api';
import type { HrCapability } from '../types';
import {
	approveLeaveRequestInputSchema,
	approveLeaveRequestOutputSchema,
	type ApproveLeaveRequestInput,
	type ApproveLeaveRequestOutput
} from './schema';

/**
 * Write (R4, requires confirmation + hr:approve): approve a pending leave
 * request. Calls the management facade `createLeaveApi(...).approveRequest`,
 * which performs the atomic batch (status + balance + approval record) and the
 * attendance sync. Status-transition validation lives in the service.
 */
export const approveLeaveRequestCapability: HrCapability<
	ApproveLeaveRequestInput,
	ApproveLeaveRequestOutput
> = {
	id: 'hr.approve-leave-request',
	description: 'Approve a pending leave request (HR/admin only).',
	riskLevel: 'R4',
	inputSchema: approveLeaveRequestInputSchema,
	outputSchema: approveLeaveRequestOutputSchema,
	idempotencyKey: (input) => {
		const i = input as ApproveLeaveRequestInput;
		return `hr.approve-leave-request:${i.leaveRequestId}`;
	},

	async execute(input, ctx) {
		if (!ctx.moduleContext) {
			throw new Error('hr.approve-leave-request requires a moduleContext');
		}
		const leave = createLeaveApi(ctx.moduleContext);
		await leave.approveRequest(input.leaveRequestId, input.comment);
		return { approved: true, leaveRequestId: input.leaveRequestId };
	}
};
