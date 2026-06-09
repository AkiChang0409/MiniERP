import { EmployeeMasterService } from '$modules/hr/services/employee-master-service';
import { AllocationRepository, PayoutRepository } from '$modules/hr/repositories/employee-repository';
import {
	AllocationService,
	CompensationService,
	ProjectStaffingService,
	SettlementService
} from '$modules/hr/services/employee-service';
import { PersonService } from '$modules/hr/services/person-service';

type LegacyCompensationService = InstanceType<typeof CompensationService>;
type LegacySettlementService = InstanceType<typeof SettlementService>;
type LegacyAllocationService = InstanceType<typeof AllocationService>;
type LegacyAllocationRepository = InstanceType<typeof AllocationRepository>;
type LegacyProjectStaffingService = InstanceType<typeof ProjectStaffingService>;
type LegacyEmployeeMasterService = InstanceType<typeof EmployeeMasterService>;
type LegacyPayoutRepository = InstanceType<typeof PayoutRepository>;
type LegacyPersonService = InstanceType<typeof PersonService>;

export interface HrDirectorySource {
	getProjectComponents: LegacyCompensationService['getProjectComponents'];
	listEmployees: LegacyEmployeeMasterService['listEmployees'];
	listLinkableEmployees: LegacyEmployeeMasterService['listLinkableEmployees'];
	createEmployeeProfile: LegacyEmployeeMasterService['createEmployeeProfile'];
	getEmployeeDetailPage: LegacyEmployeeMasterService['getEmployeeDetailPage'];
	updateEmployeeProfile: LegacyEmployeeMasterService['updateEmployeeProfile'];
	addCompanyComponent: LegacyEmployeeMasterService['addCompanyComponent'];
	removeCompanyComponent: LegacyEmployeeMasterService['removeCompanyComponent'];
	saveEmployeeProjectAllocations: LegacyEmployeeMasterService['saveEmployeeProjectAllocations'];
	deleteEmployee: LegacyEmployeeMasterService['deleteEmployee'];
	getEmployeeComponents: LegacyCompensationService['getEmployeeComponents'];
	addProjectComponent: LegacyCompensationService['addProjectComponent'];
	removeProjectComponent: LegacyCompensationService['removeProjectComponent'];
	addEmployeeComponent: LegacyCompensationService['addEmployeeComponent'];
	removeEmployeeComponent: LegacyCompensationService['removeEmployeeComponent'];
	settleProjectComponents: LegacySettlementService['settleProjectComponents'];
	settleCompanyAllocation: LegacySettlementService['settleCompanyAllocation'];
	getAllocationsByEmployee: LegacyAllocationService['getByEmployee'];
	getAllocationsByProject: LegacyAllocationService['getByProject'];
	saveAllocations: LegacyAllocationService['saveAllocations'];
	getProjectStaffingPage: LegacyProjectStaffingService['getProjectStaffingPage'];
	getProjectStaffingDetailPage: LegacyProjectStaffingService['getProjectStaffingDetailPage'];
	settleAllProjectStaffForMonth: LegacyProjectStaffingService['settleAllForMonth'];
	addProjectStaffingMember: LegacyProjectStaffingService['addToProject'];
	removeProjectStaffingMember: LegacyProjectStaffingService['removeFromProject'];
	updateProjectStaffingAssignment: LegacyProjectStaffingService['updateAssignment'];
	addManualProjectStaffingComponent: LegacyProjectStaffingService['addManualProjectComponent'];
	removeManualProjectStaffingComponent:
		LegacyProjectStaffingService['removeManualProjectComponent'];
	settleProjectStaffingCompanyAllocation:
		LegacyProjectStaffingService['settleCompanyAllocationForProjectEmployee'];
	settleProjectStaffingComponents:
		LegacyProjectStaffingService['settleProjectComponentsForProjectEmployee'];
	getProjectStaffCost: LegacyPayoutRepository['getProjectStaffCost'];
	getPayoutsByProject: LegacyPayoutRepository['findByProject'];
}

export interface HrPeopleSource {
	getPersonById: LegacyPersonService['getPersonById'];
	getPersonWithRoles: LegacyPersonService['getPersonWithRoles'];
	createPerson: LegacyPersonService['createPerson'];
	updatePerson: LegacyPersonService['updatePerson'];
	getEmployeeById: LegacyPersonService['getEmployeeById'];
	updateEmployee: LegacyPersonService['updateEmployee'];
	softDeleteEmployee: LegacyPersonService['softDeleteEmployee'];
}

export interface HrProjectArchiveSource {
	findProjectAllocations: LegacyAllocationRepository['findByProject'];
	softDeleteAllocation: LegacyAllocationRepository['softDelete'];
}

export interface HrLegacySources {
	directory: HrDirectorySource;
	people: HrPeopleSource;
}
