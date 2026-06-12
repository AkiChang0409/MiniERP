import { scorePurchaseOrderMatch } from '../../domain/rules';
import type { FinanceCapability } from '../types';
import { matchPurchaseOrderInputSchema } from './schema';

export interface MatchPurchaseOrderInput {
	supplierId?: string;
	supplierName?: string;
	totalAmount?: number;
	currency?: string;
}

export interface PurchaseOrderCandidate {
	id: string;
	poNumber: string;
	supplierId: string;
	supplierName: string;
	totalAmount: number;
	currency: string;
	matchScore: number;
}

export interface MatchPurchaseOrderOutput {
	candidates: PurchaseOrderCandidate[];
	/** `gateway` when the PO-lookup port served real data; `unavailable` when no
	 *  port was injected (capability degrades to an empty result). */
	provider: 'gateway' | 'unavailable';
}

/**
 * Find candidate purchase orders for an invoice. Thin agent-facing tool: it
 * forwards to the injected `lookupPurchaseOrders` port (procurement-backed; see
 * `FinanceCapabilityDeps`) and ranks the results with the `scorePurchaseOrderMatch`
 * domain rule. It owns no data and no matching logic of its own.
 */
export const matchPurchaseOrderCapability: FinanceCapability<
	MatchPurchaseOrderInput,
	MatchPurchaseOrderOutput
> = {
	id: 'finance.match-purchase-order',
	description: 'Find candidate purchase orders for an invoice based on supplier and amount.',
	riskLevel: 'R1',
	inputSchema: matchPurchaseOrderInputSchema,

	async execute(input, ctx) {
		const pos = await ctx.deps?.lookupPurchaseOrders?.(input);
		if (!pos) return { candidates: [], provider: 'unavailable' };

		const candidates = pos
			.map((po) => ({
				id: po.id,
				poNumber: po.poNumber,
				supplierId: po.supplierId,
				supplierName: po.supplierName,
				totalAmount: po.totalAmount,
				currency: po.currency,
				matchScore: scorePurchaseOrderMatch(input, po)
			}))
			.filter((candidate) => candidate.matchScore > 0)
			.sort((a, b) => b.matchScore - a.matchScore)
			.slice(0, 3);
		return { candidates, provider: 'gateway' };
	}
};
