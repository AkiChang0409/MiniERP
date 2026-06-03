import type { ModuleContext } from '$platform/modules/types';
import { OvertimeService } from './services/overtime-service';

export type OvertimeApi = ReturnType<typeof createOvertimeApi>;

export function createOvertimeApi(ctx: ModuleContext) {
	const svc = new OvertimeService(ctx);

	return {
		listCandidates: svc.listOvertimeCandidates.bind(svc),
		listRequests: svc.listOvertimeRequests.bind(svc),
		generateRequest: svc.generateOvertimeRequest.bind(svc),
		approveRequest: svc.approveOvertimeRequest.bind(svc),
		rejectRequest: svc.rejectOvertimeRequest.bind(svc),
		getPayrollInputs: svc.getOvertimePayrollInputs.bind(svc)
	};
}
