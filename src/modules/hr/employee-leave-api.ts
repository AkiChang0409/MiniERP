import type { ModuleContext } from '$platform/modules/types';
import { LeaveService } from './services/leave-service';

export type EmployeeLeaveApi = ReturnType<typeof createEmployeeLeaveApi>;

/**
 * Employee self-service facade for the `/employee/leave` portal.
 *
 * The `personId` is bound at construction time — the caller MUST resolve it via
 * `resolveCurrentPersonId(db, userId)` and pass the result here. No method on
 * this facade accepts a personId argument, so a forged form field can never
 * redirect reads or writes to another employee's data. Approve/reject is
 * intentionally NOT exposed: those remain admin-only on `createLeaveApi`.
 */
export function createEmployeeLeaveApi(ctx: ModuleContext, personId: string) {
	const svc = new LeaveService(ctx);

	return {
		/** Employee_profile status for the bound person ('active' / other / null). */
		getProfileStatus: () => svc.getEmployeeProfileStatus(personId),
		/** Active leave types (master data) for the submit form. */
		listLeaveTypes: svc.listLeaveTypes.bind(svc),
		/** My balances for the given year (mock-seeded on first access). */
		listMyBalances: (year?: number) => svc.listMyLeaveBalances(personId, year),
		/** My leave requests, newest first. */
		listMyRequests: () => svc.listMyLeaveRequests(personId),
		/** Submit a pending leave request scoped to the bound person. */
		submitRequest: (input: {
			leaveTypeId: string;
			startDate: string;
			endDate: string;
			reason?: string;
		}) => svc.submitLeaveRequest({ ...input, personId })
	};
}
