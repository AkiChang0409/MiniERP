import type { FinanceCapability } from '../types';
import { matchPurchaseOrderInputSchema } from './schema';
import {
	MOCK_PURCHASE_ORDERS,
	scorePurchaseOrder,
	type ScorePurchaseOrderInput
} from './mock';

export type MatchPurchaseOrderInput = ScorePurchaseOrderInput;

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
	provider: 'mock-v1';
}

export const matchPurchaseOrderCapability: FinanceCapability<
	MatchPurchaseOrderInput,
	MatchPurchaseOrderOutput
> = {
	id: 'finance.match-purchase-order',
	description: 'Find candidate purchase orders for an invoice based on supplier and amount.',
	riskLevel: 'R1',
	inputSchema: matchPurchaseOrderInputSchema,

	async execute(input) {
		const candidates = MOCK_PURCHASE_ORDERS.map((po) => ({
			id: po.id,
			poNumber: po.poNumber,
			supplierId: po.supplierId,
			supplierName: po.supplierName,
			totalAmount: po.totalAmount,
			currency: po.currency,
			matchScore: scorePurchaseOrder(input, po)
		}))
			.filter((candidate) => candidate.matchScore > 0)
			.sort((a, b) => b.matchScore - a.matchScore)
			.slice(0, 3);
		return { candidates, provider: 'mock-v1' };
	}
};
