import type { ModuleContext } from '$platform/modules/types';
import { AttendanceService } from './services/attendance-service';

export type AttendanceApi = ReturnType<typeof createAttendanceApi>;

export function createAttendanceApi(ctx: ModuleContext) {
	const svc = new AttendanceService(ctx);

	return {
		listWeeklySummary: svc.listWeeklyAttendanceSummary.bind(svc),
		listRecords: svc.listAttendanceRecords.bind(svc),
		getPersonName: svc.getPersonNameById.bind(svc),
		getPayrollInputs: svc.getAttendancePayrollInputs.bind(svc)
	};
}
