import {
	PROJECT_EVENT_TYPES,
	type ProjectEventContract,
	type ProjectEventType
} from '../domain/events';

/**
 * Project domain event publisher. Mirrors `finance/events/publishers.ts`:
 * the contract types live in `domain/events.ts`; this factory stamps the event
 * for emission on the platform event bus.
 */
export { PROJECT_EVENT_TYPES };

export function createProjectEvent<TType extends ProjectEventType>(
	type: TType,
	payload?: Record<string, unknown>
): ProjectEventContract<TType> {
	return {
		type,
		payload,
		occurredAt: new Date().toISOString()
	};
}
