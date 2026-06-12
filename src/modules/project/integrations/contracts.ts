import type {
	InboundContract,
	OutboundContract
} from '../../../platform/registry/contracts';
import type { ProjectApi } from '../services/api';

/**
 * Project integration contracts — the minimal external interfaces (gateways)
 * this module needs from other modules / platform, plus the registry-level
 * inbound (public API) + outbound (cross-boundary dependency) declarations.
 * Concrete single-monolith implementations live in `local-adapters.ts`; future
 * microservice clients in `http-adapters.ts`. (Mirrors `finance/integrations/contracts.ts`.)
 */

// ---------------------------------------------------------------------------
// Outbound gateway ports (what project needs from other modules)
// ---------------------------------------------------------------------------

/** Customer reference enrichment (sales-crm business partner). */
export interface CustomerLookupAdapter<TCustomer = unknown> {
	getCustomerById(customerId: string): Promise<TCustomer | null>;
}

export function createCustomerLookupAdapter<TCustomer>(
	getCustomerById: (customerId: string) => Promise<TCustomer | null>
): CustomerLookupAdapter<TCustomer> {
	return { getCustomerById };
}

/** People / user directory enrichment (hr person or auth user). */
export interface PeopleLookupAdapter<TPerson = unknown> {
	getPersonById(personId: string): Promise<TPerson | null>;
}

export function createPeopleLookupAdapter<TPerson>(
	getPersonById: (personId: string) => Promise<TPerson | null>
): PeopleLookupAdapter<TPerson> {
	return { getPersonById };
}

/**
 * Finance figures for a project's profit summary. Mirrors the `deps` already
 * injected into `getProjectFinancials` — declared here as a named port so a
 * future microservice client can supply the same shape.
 */
export interface FinanceSummaryAdapter {
	getRevenue(projectId: string): Promise<number>;
	getPurchaseCost(projectId: string): Promise<number>;
	getStaffCost(projectId: string): Promise<number>;
	getExpenseSums(projectId: string): Promise<{ cogs: number; opex: number }>;
}

// ---------------------------------------------------------------------------
// Registry-level contract declarations
// ---------------------------------------------------------------------------

export interface ProjectInboundContract {
	projects: ProjectApi;
}

export const PROJECT_PUBLIC_GROUPS = ['projects'] as const;

export type ProjectPublicGroup = (typeof PROJECT_PUBLIC_GROUPS)[number];

/** Registry-level declaration of project's inbound (public API) contracts. */
export const projectInboundContracts: InboundContract[] = [
	{
		id: 'project.projects',
		description: 'Project list, detail, membership, and financial summary operations',
		mode: 'sync',
		input: { name: 'project-input', version: 'v1' },
		output: { name: 'project-output', version: 'v1' },
		requiredPermissions: ['project:view']
	}
];

/** Registry-level declaration of project's outbound (cross-boundary) dependencies. */
export const projectOutboundContracts: OutboundContract[] = [
	{
		id: 'project.people_lookup',
		provider: 'module',
		providerId: 'person',
		strength: 'weak',
		description: 'Project enriches staffing and member flows with people data',
		failurePolicy: 'degrade',
		failures: ['not_found', 'unavailable', 'timeout']
	},
	{
		id: 'project.finance_summary',
		provider: 'module',
		providerId: 'finance',
		strength: 'weak',
		description: 'Project financial summaries use finance-owned revenue and cost aggregates',
		failurePolicy: 'degrade',
		failures: ['not_found', 'unavailable', 'timeout', 'invalid_response']
	},
	{
		id: 'project.customer_lookup',
		provider: 'external',
		providerId: 'sales-crm',
		strength: 'strong',
		description: 'Project records need customer references',
		failurePolicy: 'block',
		failures: ['not_found', 'unavailable', 'timeout', 'invalid_response']
	}
];
