/**
 * Project domain errors + failure taxonomy — pure business semantics, free of
 * route/DB wiring. This is the canonical home other layers import from
 * (mirrors `finance/domain/errors.ts`).
 */

/** Thrown when the current actor lacks the rights to perform a project action. */
export class ProjectPermissionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProjectPermissionError';
	}
}

/** Thrown when project input fails field-level validation. */
export class ProjectValidationError extends Error {
	readonly fields: Record<string, string>;
	constructor(fields: Record<string, string>) {
		super(`Validation failed: ${Object.keys(fields).join(', ')}`);
		this.name = 'ProjectValidationError';
		this.fields = fields;
	}
}

// ---------------------------------------------------------------------------
// Cross-boundary failure taxonomy (registry contract semantics)
// ---------------------------------------------------------------------------

export const PROJECT_FAILURE_CODES = [
	'unavailable',
	'timeout',
	'not_found',
	'permission_denied',
	'invalid_response'
] as const;

export type ProjectFailureCode = (typeof PROJECT_FAILURE_CODES)[number];

export interface ProjectFailureSemantics {
	code: ProjectFailureCode;
	blocking: boolean;
	retryable: boolean;
}

export const projectFailureSemantics: ProjectFailureSemantics[] = [
	{ code: 'unavailable', blocking: true, retryable: true },
	{ code: 'timeout', blocking: true, retryable: true },
	{ code: 'not_found', blocking: false, retryable: false },
	{ code: 'permission_denied', blocking: true, retryable: false },
	{ code: 'invalid_response', blocking: true, retryable: false }
];
