/**
 * Purchase-order matching score (0..1). Pure domain rule, shared by the
 * `finance.match-purchase-order` capability. Combines supplier match (id exact
 * or name substring), amount proximity (within 2% strong, within 10% partial),
 * and currency agreement.
 */
export interface PurchaseOrderMatchQuery {
	supplierId?: string;
	supplierName?: string;
	totalAmount?: number;
	currency?: string;
}

export interface PurchaseOrderMatchTarget {
	supplierId: string;
	supplierName: string;
	totalAmount: number;
	currency: string;
}

export function scorePurchaseOrderMatch(
	query: PurchaseOrderMatchQuery,
	po: PurchaseOrderMatchTarget
): number {
	let score = 0;
	if (query.supplierId && query.supplierId === po.supplierId) score += 0.6;
	else if (
		query.supplierName &&
		po.supplierName.toLowerCase().includes(query.supplierName.toLowerCase())
	)
		score += 0.4;

	if (typeof query.totalAmount === 'number') {
		const diff = Math.abs(po.totalAmount - query.totalAmount);
		const tolerance = Math.max(po.totalAmount * 0.02, 1);
		if (diff <= tolerance) score += 0.4;
		else if (diff <= po.totalAmount * 0.1) score += 0.2;
	}

	if (query.currency && po.currency === query.currency) score += 0.05;

	return Math.min(score, 1);
}
