import type { ModuleContext } from '$platform/modules/types';
import { createHrDirectoryLegacySource } from './adapters';
import type { HrDirectorySource } from './contracts';

export type EmployeeApi = ReturnType<typeof createHrDirectoryApi>;

export function createHrDirectoryApi(source: HrDirectorySource) {
	return {
		getProjectComponents: source.getProjectComponents,
		listEmployees: source.listEmployees,
		listLinkableEmployees: source.listLinkableEmployees,
		createEmployeeProfile: source.createEmployeeProfile,
		getEmployeeDetailPage: source.getEmployeeDetailPage,
		updateEmployeeProfile: source.updateEmployeeProfile,
		addCompanyComponent: source.addCompanyComponent,
		removeCompanyComponent: source.removeCompanyComponent,
		saveEmployeeProjectAllocations: source.saveEmployeeProjectAllocations,
		deleteEmployee: source.deleteEmployee,
		getEmployeeComponents: source.getEmployeeComponents,
		addProjectComponent: source.addProjectComponent,
		removeProjectComponent: source.removeProjectComponent,
		addEmployeeComponent: source.addEmployeeComponent,
		removeEmployeeComponent: source.removeEmployeeComponent,
		settleProjectComponents: source.settleProjectComponents,
		settleCompanyAllocation: source.settleCompanyAllocation,
		getAllocationsByEmployee: source.getAllocationsByEmployee,
		getAllocationsByProject: source.getAllocationsByProject,
		saveAllocations: source.saveAllocations,
		getProjectStaffingPage: source.getProjectStaffingPage,
		getProjectStaffingDetailPage: source.getProjectStaffingDetailPage,
		settleAllProjectStaffForMonth: source.settleAllProjectStaffForMonth,
		addProjectStaffingMember: source.addProjectStaffingMember,
		removeProjectStaffingMember: source.removeProjectStaffingMember,
		updateProjectStaffingAssignment: source.updateProjectStaffingAssignment,
		addManualProjectStaffingComponent: source.addManualProjectStaffingComponent,
		removeManualProjectStaffingComponent: source.removeManualProjectStaffingComponent,
		settleProjectStaffingCompanyAllocation: source.settleProjectStaffingCompanyAllocation,
		settleProjectStaffingComponents: source.settleProjectStaffingComponents,
		getProjectStaffCost: source.getProjectStaffCost,
		getPayoutsByProject: source.getPayoutsByProject
	};
}

export function createEmployeeApi(ctx: ModuleContext) {
	return createHrDirectoryApi(createHrDirectoryLegacySource(ctx));
}
