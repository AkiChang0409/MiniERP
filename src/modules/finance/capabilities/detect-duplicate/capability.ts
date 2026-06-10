import { detectDuplicateFinanceRecord } from '../../domain/detect-duplicate';
import type { FinanceCapability } from '../types';
import { detectDuplicateInputSchema } from './schema';

export interface DuplicateCandidatePayload {
	documentNumber?: string | null;
	amount?: number | null;
	counterparty?: string | null;
}

export interface DetectDuplicateInput {
	candidate: DuplicateCandidatePayload;
	existing: DuplicateCandidatePayload[];
}

export interface DetectDuplicateOutput {
	isDuplicate: boolean;
	reason: string | null;
}

function buildReason(
	candidate: DuplicateCandidatePayload,
	existing: DuplicateCandidatePayload[]
): string | null {
	const matchedByNumber = existing.find(
		(item) =>
			candidate.documentNumber &&
			item.documentNumber &&
			candidate.documentNumber === item.documentNumber
	);
	if (matchedByNumber) return 'Same document number already on file';

	const matchedByAmountAndParty = existing.find(
		(item) =>
			candidate.amount === item.amount &&
			candidate.counterparty &&
			item.counterparty &&
			candidate.counterparty === item.counterparty
	);
	if (matchedByAmountAndParty) return 'Same amount and counterparty already recorded';

	return null;
}

export const detectDuplicateCapability: FinanceCapability<
	DetectDuplicateInput,
	DetectDuplicateOutput
> = {
	id: 'finance.detect-duplicate',
	description: 'Detect whether a candidate finance record duplicates an existing one.',
	riskLevel: 'R1',
	inputSchema: detectDuplicateInputSchema,

	async execute(input) {
		const isDuplicate = detectDuplicateFinanceRecord(input.candidate, input.existing);
		return {
			isDuplicate,
			reason: isDuplicate ? buildReason(input.candidate, input.existing) : null
		};
	}
};
