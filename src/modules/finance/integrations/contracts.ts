import type { InboundContract, OutboundContract } from '../../../platform/registry/contracts';

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


/** Registry-level declaration of finance's inbound (public API) contracts. */
export const financeInboundContracts: InboundContract[] = [
	{ id: 'finance.documents', description: 'Finance document and doc-hub operations', mode: 'sync', input: { name: 'finance-document-input', version: 'v1' }, output: { name: 'finance-document-output', version: 'v1' }, requiredPermissions: ['finance:view'] },
	{ id: 'finance.billing', description: 'Finance billing and customer invoice operations', mode: 'sync', input: { name: 'finance-billing-input', version: 'v1' }, output: { name: 'finance-billing-output', version: 'v1' }, requiredPermissions: ['finance:view', 'finance:edit'] },
	{ id: 'finance.expenses', description: 'Expense recording and reimbursement operations', mode: 'sync', input: { name: 'finance-expense-input', version: 'v1' }, output: { name: 'finance-expense-output', version: 'v1' }, requiredPermissions: ['finance:view', 'finance:edit'] },
	{ id: 'finance.revenue', description: 'Revenue record operations', mode: 'sync', input: { name: 'finance-revenue-input', version: 'v1' }, output: { name: 'finance-revenue-output', version: 'v1' }, requiredPermissions: ['finance:view', 'finance:edit'] },
	{ id: 'finance.taxes', description: 'Finance tax and GST operations', mode: 'sync', input: { name: 'finance-tax-input', version: 'v1' }, output: { name: 'finance-tax-output', version: 'v1' }, requiredPermissions: ['finance:view', 'finance:tax'] },
	{ id: 'finance.insights', description: 'Finance reporting and insight operations', mode: 'sync', input: { name: 'finance-insight-input', version: 'v1' }, output: { name: 'finance-insight-output', version: 'v1' }, requiredPermissions: ['finance:view'] },
	{ id: 'finance.categories', description: 'Chart of accounts / expense category management', mode: 'sync', input: { name: 'finance-category-input', version: 'v1' }, output: { name: 'finance-category-output', version: 'v1' }, requiredPermissions: ['finance:view', 'finance:edit'] },
	{ id: 'finance.einvoice', description: 'Peppol BIS e-invoice generation and InvoiceNow Access Point operations', mode: 'sync', input: { name: 'finance-einvoice-input', version: 'v1' }, output: { name: 'finance-einvoice-output', version: 'v1' }, requiredPermissions: ['finance:view', 'finance:edit'] }
];
