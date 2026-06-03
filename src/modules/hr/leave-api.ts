import type { ModuleContext } from '$platform/modules/types';
import { LeaveService } from './services/leave-service';

export type LeaveApi = ReturnType<typeof createLeaveApi>;

export function createLeaveApi(ctx: ModuleContext) {
	const svc = new LeaveService(ctx);

	return {
		listLeaveTypes: svc.listLeaveTypes.bind(svc),
		listLeaveRequests: svc.listLeaveRequests.bind(svc),
		approveRequest: svc.approveLeaveRequest.bind(svc),
		rejectRequest: svc.rejectLeaveRequest.bind(svc),
		listLeaveBalances: svc.listLeaveBalances.bind(svc),
		syncBackfill: svc.syncApprovedLeavesToAttendance.bind(svc)
	};
}
