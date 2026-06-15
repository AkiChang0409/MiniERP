import type { z } from 'zod';
import { scoreSupplierNameMatch } from '../../domain/rules';
import type { FinanceCapability } from '../types';
import { matchSupplierInputSchema } from './schema';

export type MatchSupplierInput = z.infer<typeof matchSupplierInputSchema>;

export interface SupplierCandidate {
	id: string;
	name: string;
	matchScore: number;
	recentInvoiceCount: number;
}

export interface MatchSupplierOutput {
	candidates: SupplierCandidate[];
	/** `gateway` when the supplier-lookup port served real data; `unavailable`
	 *  when no port was injected (capability degrades to an empty result). */
	provider: 'gateway' | 'unavailable';
}

/**
 * Find candidate suppliers for an invoice. Thin agent-facing tool: it forwards
 * to the injected `lookupSuppliers` port (procurement-backed; see
 * `FinanceCapabilityDeps`) and ranks the results with the `scoreSupplierNameMatch`
 * domain rule. It owns no data and no matching logic of its own.
 */
export const matchSupplierCapability: FinanceCapability<MatchSupplierInput, MatchSupplierOutput> = {
	id: 'finance.match-supplier',
	description: 'Find candidate suppliers for an invoice based on extracted counterparty name.',
	riskLevel: 'R1',
	inputSchema: matchSupplierInputSchema,

	async execute(input, ctx) {
		const query = input.counterpartyName ?? '';
		const suppliers = await ctx.deps?.lookupSuppliers?.({ counterpartyName: query });
		if (!suppliers) return { candidates: [], provider: 'unavailable' };

		const candidates = suppliers
			.map((supplier) => ({
				id: supplier.id,
				name: supplier.name,
				matchScore: scoreSupplierNameMatch(query, supplier.name),
				recentInvoiceCount: supplier.recentInvoiceCount ?? 0
			}))
			.filter((candidate) => candidate.matchScore > 0)
			.sort((a, b) => b.matchScore - a.matchScore)
			.slice(0, 3);
		return { candidates, provider: 'gateway' };
	}
};
