/**
 * Fuzzy supplier-name matching score (0..1). Pure domain rule, shared by the
 * `finance.match-supplier` capability. Exact match = 1; substring containment
 * = high; otherwise token-overlap ratio.
 */
function tokenize(value: string): string[] {
	return value
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length >= 2);
}

export function scoreSupplierNameMatch(query: string, supplierName: string): number {
	if (!query) return 0;
	const haystack = supplierName.toLowerCase();
	const queryLower = query.toLowerCase();
	if (haystack === queryLower) return 1;
	if (haystack.includes(queryLower)) return 0.85;
	if (queryLower.includes(haystack)) return 0.8;

	const queryTokens = new Set(tokenize(query));
	const supplierTokens = tokenize(supplierName);
	if (queryTokens.size === 0 || supplierTokens.length === 0) return 0;
	let overlap = 0;
	for (const token of supplierTokens) {
		if (queryTokens.has(token)) overlap += 1;
	}
	return overlap / supplierTokens.length;
}
