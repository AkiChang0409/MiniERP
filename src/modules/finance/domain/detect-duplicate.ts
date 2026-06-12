type DuplicateCandidate = {
	documentNumber?: string | null;
	amount?: number | null;
	counterparty?: string | null;
};

export function detectDuplicateFinanceRecord(
	candidate: DuplicateCandidate,
	existing: DuplicateCandidate[]
) {
	return existing.some((item) => {
		const sameDocumentNumber =
			candidate.documentNumber &&
			item.documentNumber &&
			candidate.documentNumber === item.documentNumber;
		const sameAmount =
			candidate.amount !== null &&
			candidate.amount !== undefined &&
			item.amount !== null &&
			item.amount !== undefined &&
			candidate.amount === item.amount;
		const sameCounterparty =
			candidate.counterparty &&
			item.counterparty &&
			candidate.counterparty === item.counterparty;

		return Boolean(sameDocumentNumber || (sameAmount && sameCounterparty));
	});
}
