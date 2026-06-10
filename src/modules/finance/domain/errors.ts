/**
 * Finance domain failure taxonomy — pure business semantics, no framework/DB/AI.
 * Describes how each cross-boundary failure should be treated (blocking /
 * retryable). Consumed by integrations + contract surfaces.
 */
export const FINANCE_FAILURE_CODES = [
	'unavailable',
	'timeout',
	'not_found',
	'permission_denied',
	'invalid_response'
] as const;

export type FinanceFailureCode = (typeof FINANCE_FAILURE_CODES)[number];

export interface FinanceFailureSemantics {
	code: FinanceFailureCode;
	blocking: boolean;
	retryable: boolean;
}

export const financeFailureSemantics: FinanceFailureSemantics[] = [
	{ code: 'unavailable', blocking: true, retryable: true },
	{ code: 'timeout', blocking: true, retryable: true },
	{ code: 'not_found', blocking: false, retryable: false },
	{ code: 'permission_denied', blocking: true, retryable: false },
	{ code: 'invalid_response', blocking: true, retryable: false }
];
