import type { EventContract } from '../../../platform/registry/contracts';

/**
 * Finance domain events — the canonical list of events this module publishes.
 * Runtime publishers live in `events/publishers.ts`; the registry contract
 * (`financeEventContracts`) is consumed by `module.ts` / the module manifest.
 */
export const FINANCE_EVENT_TYPES = [
	'finance.expense.created',
	'finance.document.processed',
	'finance.task.completed',
	'finance.record.validation_failed'
] as const;

export type FinanceEventType = (typeof FINANCE_EVENT_TYPES)[number];

export interface FinanceEventContract<TType extends FinanceEventType = FinanceEventType> {
	type: TType;
	entityId?: string | null;
	projectId?: string | null;
	occurredAt?: string;
	payload?: Record<string, unknown>;
}

export const financeEventContracts: EventContract[] = [
	{
		type: 'finance.expense.created',
		payload: { name: 'finance-expense-event', version: 'v1' },
		emittedWhen: 'A finance expense record is created',
		retryable: true
	},
	{
		type: 'finance.document.processed',
		payload: { name: 'finance-document-event', version: 'v1' },
		emittedWhen: 'A finance document finishes intake processing',
		retryable: true
	},
	{
		type: 'finance.task.completed',
		payload: { name: 'finance-task-event', version: 'v1' },
		emittedWhen: 'A finance task completes in the workflow layer',
		retryable: true
	},
	{
		type: 'finance.record.validation_failed',
		payload: { name: 'finance-validation-event', version: 'v1' },
		emittedWhen: 'A finance record fails validation',
		retryable: false
	}
];
