import type { OutboundContract } from '../../../platform/registry/contracts';

/**
 * Finance integration contracts — the minimal external interfaces (gateways)
 * this module needs from other modules / platform, plus the registry-level
 * outbound dependency declaration. Concrete single-monolith implementations
 * live in `local-adapters.ts`; future microservice clients in `http-adapters.ts`.
 */

export interface ProjectLookupAdapter<TProject = unknown> {
	getProjectById(projectId: string): Promise<TProject | null>;
}

export function createProjectLookupAdapter<TProject>(
	getProjectById: (projectId: string) => Promise<TProject | null>
): ProjectLookupAdapter<TProject> {
	return { getProjectById };
}

export interface EmployeeLookupAdapter<TEmployee = unknown> {
	getEmployeeById(employeeId: string): Promise<TEmployee | null>;
}

export function createEmployeeLookupAdapter<TEmployee>(
	getEmployeeById: (employeeId: string) => Promise<TEmployee | null>
): EmployeeLookupAdapter<TEmployee> {
	return { getEmployeeById };
}

/** Registry-level declaration of finance's outbound (cross-boundary) dependencies. */
export const financeOutboundContracts: OutboundContract[] = [
	{
		id: 'finance.project_lookup',
		provider: 'module',
		providerId: 'project',
		strength: 'weak',
		description: 'Project lookup enrichment for finance records',
		failurePolicy: 'degrade',
		failures: ['not_found', 'unavailable', 'timeout']
	},
	{
		id: 'finance.employee_lookup',
		provider: 'module',
		providerId: 'person',
		strength: 'weak',
		description: 'Employee summary lookup for finance records',
		failurePolicy: 'degrade',
		failures: ['not_found', 'unavailable', 'timeout']
	},
	{
		id: 'finance.file_storage',
		provider: 'platform',
		providerId: 'files',
		strength: 'strong',
		description: 'File storage and artifact access for finance documents',
		failurePolicy: 'block',
		failures: ['unavailable', 'timeout', 'invalid_response']
	},
	{
		id: 'finance.permission_check',
		provider: 'platform',
		providerId: 'permissions',
		strength: 'strong',
		description: 'Permission checks for finance operations',
		failurePolicy: 'block',
		failures: ['permission_denied', 'unavailable']
	}
];
