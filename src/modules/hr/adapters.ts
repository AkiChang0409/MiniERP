import type { ModuleContext } from '$platform/modules/types';
import { EmployeeMasterService } from '$modules/hr/services/employee-master-service';
import { AllocationRepository, PayoutRepository } from '$modules/hr/repositories/employee-repository';
import {
	AllocationService,
	CompensationService,
	ProjectStaffingService,
	SettlementService
} from '$modules/hr/services/employee-service';
import { PersonService } from '$modules/hr/services/person-service';
import type {
	HrDirectorySource,
	HrLegacySources,
	HrPeopleSource,
	HrProjectArchiveSource
} from './contracts';

export function createHrDirectoryLegacySource(ctx: ModuleContext): HrDirectorySource {
	const comp = new CompensationService(ctx);
	const settlement = new SettlementService(ctx);
	const allocation = new AllocationService(ctx);
	const projectStaffing = new ProjectStaffingService(ctx);
	const employeeMaster = new EmployeeMasterService(ctx);
	const payoutRepo = new PayoutRepository(ctx.db);

	return {
		getProjectComponents: comp.getProjectComponents.bind(comp),
		listEmployees: employeeMaster.listEmployees.bind(employeeMaster),
		listLinkableEmployees: employeeMaster.listLinkableEmployees.bind(employeeMaster),
		createEmployeeProfile: employeeMaster.createEmployeeProfile.bind(employeeMaster),
		getEmployeeDetailPage: employeeMaster.getEmployeeDetailPage.bind(employeeMaster),
		updateEmployeeProfile: employeeMaster.updateEmployeeProfile.bind(employeeMaster),
		addCompanyComponent: employeeMaster.addCompanyComponent.bind(employeeMaster),
		removeCompanyComponent: employeeMaster.removeCompanyComponent.bind(employeeMaster),
		saveEmployeeProjectAllocations: employeeMaster.saveEmployeeProjectAllocations.bind(employeeMaster),
		deleteEmployee: employeeMaster.deleteEmployee.bind(employeeMaster),
		getEmployeeComponents: comp.getEmployeeComponents.bind(comp),
		addProjectComponent: comp.addProjectComponent.bind(comp),
		removeProjectComponent: comp.removeProjectComponent.bind(comp),
		addEmployeeComponent: comp.addEmployeeComponent.bind(comp),
		removeEmployeeComponent: comp.removeEmployeeComponent.bind(comp),
		settleProjectComponents: settlement.settleProjectComponents.bind(settlement),
		settleCompanyAllocation: settlement.settleCompanyAllocation.bind(settlement),
		getAllocationsByEmployee: allocation.getByEmployee.bind(allocation),
		getAllocationsByProject: allocation.getByProject.bind(allocation),
		saveAllocations: allocation.saveAllocations.bind(allocation),
		getProjectStaffingPage: projectStaffing.getProjectStaffingPage.bind(projectStaffing),
		getProjectStaffingDetailPage: projectStaffing.getProjectStaffingDetailPage.bind(projectStaffing),
		settleAllProjectStaffForMonth: projectStaffing.settleAllForMonth.bind(projectStaffing),
		addProjectStaffingMember: projectStaffing.addToProject.bind(projectStaffing),
		removeProjectStaffingMember: projectStaffing.removeFromProject.bind(projectStaffing),
		updateProjectStaffingAssignment: projectStaffing.updateAssignment.bind(projectStaffing),
		addManualProjectStaffingComponent: projectStaffing.addManualProjectComponent.bind(projectStaffing),
		removeManualProjectStaffingComponent:
			projectStaffing.removeManualProjectComponent.bind(projectStaffing),
		settleProjectStaffingCompanyAllocation:
			projectStaffing.settleCompanyAllocationForProjectEmployee.bind(projectStaffing),
		settleProjectStaffingComponents:
			projectStaffing.settleProjectComponentsForProjectEmployee.bind(projectStaffing),
		getProjectStaffCost: payoutRepo.getProjectStaffCost.bind(payoutRepo),
		getPayoutsByProject: payoutRepo.findByProject.bind(payoutRepo)
	};
}

export function createHrPeopleLegacySource(ctx: ModuleContext): HrPeopleSource {
	const svc = new PersonService(ctx);

	return {
		getPersonById: svc.getPersonById.bind(svc),
		getPersonWithRoles: svc.getPersonWithRoles.bind(svc),
		createPerson: svc.createPerson.bind(svc),
		updatePerson: svc.updatePerson.bind(svc),
		getEmployeeById: svc.getEmployeeById.bind(svc),
		updateEmployee: svc.updateEmployee.bind(svc),
		softDeleteEmployee: svc.softDeleteEmployee.bind(svc)
	};
}

export function createHrProjectArchiveLegacySource(ctx: ModuleContext): HrProjectArchiveSource {
	const allocationRepo = new AllocationRepository(ctx.db);

	return {
		findProjectAllocations: allocationRepo.findByProject.bind(allocationRepo),
		softDeleteAllocation: allocationRepo.softDelete.bind(allocationRepo)
	};
}

export function createHrLegacySources(ctx: ModuleContext): HrLegacySources {
	return {
		directory: createHrDirectoryLegacySource(ctx),
		people: createHrPeopleLegacySource(ctx)
	};
}
