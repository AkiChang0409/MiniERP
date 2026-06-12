import type { FinanceRiskLevel } from '../../agent/types';

/**
 * allowance-recording — the only finance intake flow that does NOT involve a
 * document. Per ref_files/smartfin-expense-revenue-design.md §4.5, allowance
 * is a per-diem record:
 *
 *   destination = China    → daily_rate = 50 SGD/day
 *   destination = Malaysia → daily_rate = 45 SGD/day
 *   destination = other    → user fills daily_rate
 *
 *   total_amount = days × daily_rate (auto-computed)
 *
 * The workflow skips upload/extract/match entirely — user fills a form,
 * confirms, the record lands in `expenses` with category=allowance.
 */
export type AllowanceRecordingStepId =
	| 'trigger'
	| 'manual_entry'
	| 'user_confirmation'
	| 'record_creation'
	| 'completion';

export interface AllowanceRecordingStep {
	id: AllowanceRecordingStepId;
	allowedCapabilities: readonly string[];
	riskLevel: FinanceRiskLevel;
	requiresUserConfirmation: boolean;
	nextSteps: readonly AllowanceRecordingStepId[];
}

export interface AllowanceRecordingWorkflowDefinition {
	id: 'allowance-recording';
	description: string;
	initialStep: AllowanceRecordingStepId;
	steps: readonly AllowanceRecordingStep[];
}

export const allowanceRecordingWorkflow: AllowanceRecordingWorkflowDefinition = {
	id: 'allowance-recording',
	description:
		'Per-diem allowance — no document, manual entry of staff/destination/days. Auto-computes total via destination → daily_rate.',
	initialStep: 'trigger',
	steps: [
		{
			id: 'trigger',
			allowedCapabilities: [],
			riskLevel: 'R0',
			requiresUserConfirmation: false,
			nextSteps: ['manual_entry']
		},
		{
			id: 'manual_entry',
			allowedCapabilities: [],
			riskLevel: 'R2',
			requiresUserConfirmation: false,
			nextSteps: ['user_confirmation']
		},
		{
			id: 'user_confirmation',
			allowedCapabilities: [],
			riskLevel: 'R3',
			requiresUserConfirmation: true,
			nextSteps: ['record_creation']
		},
		{
			id: 'record_creation',
			allowedCapabilities: ['finance.create-expense-record'],
			riskLevel: 'R4',
			requiresUserConfirmation: true,
			nextSteps: ['completion']
		},
		{
			id: 'completion',
			allowedCapabilities: ['finance.suggest-next-finance-task'],
			riskLevel: 'R0',
			requiresUserConfirmation: false,
			nextSteps: []
		}
	]
};

export function findAllowanceRecordingStep(
	id: AllowanceRecordingStepId
): AllowanceRecordingStep | undefined {
	return allowanceRecordingWorkflow.steps.find((step) => step.id === id);
}

/**
 * Destination → daily rate (SGD). Pulled from
 * ref_files/smartfin-expense-revenue-design.md §4.5. `null` means the user
 * supplied a custom rate.
 */
export const ALLOWANCE_DAILY_RATES: Record<string, number> = {
	China: 50,
	Malaysia: 45
};

export function resolveDailyRate(destination: string): number | null {
	const exact = ALLOWANCE_DAILY_RATES[destination];
	if (typeof exact === 'number') return exact;
	const normalized = Object.entries(ALLOWANCE_DAILY_RATES).find(
		([key]) => key.toLowerCase() === destination.trim().toLowerCase()
	);
	return normalized ? normalized[1] : null;
}
