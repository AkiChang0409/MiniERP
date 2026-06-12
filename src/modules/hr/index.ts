import type { AgentAction } from '$platform/ai/legacy-agent/types';
import type { EventBus, ModuleContext, ModuleDefinition } from '$platform/modules/types';
import { registerEmployeeHandlers, registerPersonHandlers } from './handlers';

function registerHrHandlers(bus: EventBus, ctx: ModuleContext) {
	registerPersonHandlers(bus, ctx);
	registerEmployeeHandlers(bus, ctx);
}

/**
 * HR is a single v4 target module owning persons, employees, allocations,
 * compensation components, and payouts. The earlier `person` and `employee`
 * module ids were collapsed in Wave 3.3.
 */
export const hrModule: ModuleDefinition = {
	manifest: {
		id: 'hr',
		name: 'HR',
		layer: 'base',
		dependencies: ['core', 'project']
	},
	registerHandlers: registerHrHandlers
};

export { createHrApi, type HrApi } from './api';
export { createEmployeeApi, type EmployeeApi } from './employee-api';
export { createLeaveApi, type LeaveApi } from './leave-api';
export { createEmployeeLeaveApi, type EmployeeLeaveApi } from './employee-leave-api';
export { LeaveValidationError } from './services/leave-service';
export { createAttendanceApi, type AttendanceApi } from './attendance-api';
export { AttendanceValidationError } from './services/attendance-service';
export { createOvertimeApi, type OvertimeApi } from './overtime-api';
export { OvertimeValidationError } from './services/overtime-service';
export { createPersonApi, type PersonApi } from './person-api';
export {
	staffCostPayoutStatuses,
	staffCostExcludedIncomeTypes,
	staffCostPayoutJoinConditions,
	staffCostSumExpr,
	staffCostPeriodBetween,
	allocationPeriodDay,
	periodCalendarMonth,
	shadowCompensationComponentId,
	runSettleManualProjectComponentsForMonth,
	settleCompanyAllocationMonth
} from './compat';
export type { HrDirectorySource, HrLegacySources, HrPeopleSource } from './contracts';

// HR Agent surface (Phase 1) — intent classifier + manifest + policy for the
// AI capability layer. Capabilities themselves are registered from the app
// composition root (`register-ai-capabilities.ts`), which may deep-import the
// `./capabilities` and `./agent` sub-barrels directly.
export {
	hrAgentManifest,
	type HrAgentManifest,
	HR_AGENT_ID,
	hrAgentAllowedCapabilities,
	findHrCapabilityPolicy,
	type HrCapabilityPolicyEntry,
	classifyHrIntent,
	type HrIntentResult,
	classifyHrIntentLlm,
	hrLlmIntentSchema,
	HR_CAPABILITY_SPECS,
	type HrLlmIntent,
	type HrIntentContext,
	type HrCapabilitySpec,
	summarizeHrResult,
	resolveLeaveType,
	LEAVE_TYPE_ALIASES,
	type LeaveTypeLike
} from './agent';

export const employeeActions: AgentAction[] = [
	{
		id: 'view_employees',
		module: 'hr',
		description: 'View the employee directory',
		keywords: ['employees', 'staff list', 'HR roster'],
		entry: '/hr/employees',
		layer: 1,
		required_roles: ['owner', 'finance', 'project_manager']
	},
	{
		id: 'create_employee',
		module: 'hr',
		description: 'Create an employee record',
		keywords: ['new employee', 'create staff', 'hire', 'add employee'],
		entry: '/hr/employees/new',
		layer: 2,
		required_roles: ['owner', 'finance'],
		params: [
			{ name: 'name', type: 'string', required: true, description: 'Employee name' },
			{
				name: 'type',
				type: 'string',
				required: false,
				description: 'Employment type: full_time / part_time / freelancer / advisor'
			},
			{
				name: 'start_date',
				type: 'date',
				required: false,
				description: 'Start date (YYYY-MM-DD, or "today")'
			},
			{ name: 'end_date', type: 'date', required: false, description: 'End date (YYYY-MM-DD)' },
			{ name: 'contact', type: 'string', required: false, description: 'Contact / email' },
			{ name: 'tax_id', type: 'string', required: false, description: 'Tax ID' }
		]
	}
];
