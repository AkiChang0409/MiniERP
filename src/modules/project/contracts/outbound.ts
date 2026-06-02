import type { OutboundContract } from '../../../platform/registry/contracts';

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
