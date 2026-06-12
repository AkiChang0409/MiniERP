export type DuplicateCandidate = {
	documentNumber?: string | null;
	amount?: number | null;
	counterparty?: string | null;
};

export interface DuplicateDetectionResult {
	isDuplicate: boolean;
	/** Human-readable reason when a duplicate was found, else null. */
	reason: string | null;
}

/**
 * Single source of truth for finance duplicate detection. A candidate duplicates
 * an existing record when it shares a document number, OR shares both amount and
 * counterparty. Returns the match reason alongside the verdict so callers never
 * re-derive the matching logic.
 */
export function detectDuplicateFinanceRecord(
	candidate: DuplicateCandidate,
	existing: DuplicateCandidate[]
): DuplicateDetectionResult {
	const matchedByNumber = existing.find(
		(item) =>
			candidate.documentNumber &&
			item.documentNumber &&
			candidate.documentNumber === item.documentNumber
	);
	if (matchedByNumber) {
		return { isDuplicate: true, reason: 'Same document number already on file' };
	}

	const matchedByAmountAndParty = existing.find(
		(item) =>
			candidate.amount !== null &&
			candidate.amount !== undefined &&
			item.amount !== null &&
			item.amount !== undefined &&
			candidate.amount === item.amount &&
			candidate.counterparty &&
			item.counterparty &&
			candidate.counterparty === item.counterparty
	);
	if (matchedByAmountAndParty) {
		return { isDuplicate: true, reason: 'Same amount and counterparty already recorded' };
	}

	return { isDuplicate: false, reason: null };
}
