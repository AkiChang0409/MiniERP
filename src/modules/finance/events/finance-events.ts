import {
	FINANCE_EVENT_TYPES,
	type FinanceEventContract,
	type FinanceEventType
} from '../domain/events';

export { FINANCE_EVENT_TYPES };

export function createFinanceEvent<TType extends FinanceEventType>(
	type: TType,
	payload?: Record<string, unknown>
): FinanceEventContract<TType> {
	return {
		type,
		payload,
		occurredAt: new Date().toISOString()
	};
}
