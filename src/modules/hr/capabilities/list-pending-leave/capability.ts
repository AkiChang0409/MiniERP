import { createLeaveApi } from '../../leave-api';
import type { HrCapability } from '../types';
import {
	listPendingLeaveInputSchema,
	listPendingLeaveOutputSchema,
	type ListPendingLeaveInput,
	type ListPendingLeaveOutput
} from './schema';

/**
 * Read-only: list pending leave requests for HR review.
 * Calls the management facade `createLeaveApi(...).listLeaveRequests`.
 */
export const listPendingLeaveCapability: HrCapability<
	ListPendingLeaveInput,
	ListPendingLeaveOutput
> = {
	id: 'hr.list-pending-leave',
	description: 'List pending leave requests awaiting HR approval.',
	riskLevel: 'R1',
	inputSchema: listPendingLeaveInputSchema,
	outputSchema: listPendingLeaveOutputSchema,

	async execute(input, ctx) {
		if (!ctx.moduleContext) {
			throw new Error('hr.list-pending-leave requires a moduleContext');
		}
		const leave = createLeaveApi(ctx.moduleContext);
		const rows = await leave.listLeaveRequests({
			status: 'pending',
			leaveTypeId: input.leaveTypeId
		});
		return {
			count: rows.length,
			requests: rows.map((r) => ({
				id: r.id,
				personId: r.personId,
				personName: r.personName,
				leaveTypeName: r.leaveTypeName,
				startDate: r.startDate,
				endDate: r.endDate,
				totalDays: r.totalDays,
				status: r.status
			}))
		};
	}
};
