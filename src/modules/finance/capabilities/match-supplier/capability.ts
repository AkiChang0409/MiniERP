import type { FinanceCapability } from '../types';
import { matchSupplierInputSchema } from './schema';
import { MOCK_SUPPLIER_DIRECTORY, scoreSupplier } from './mock';

export interface MatchSupplierInput {
	counterpartyName?: string;
}

export interface SupplierCandidate {
	id: string;
	name: string;
	matchScore: number;
	recentInvoiceCount: number;
}

export interface MatchSupplierOutput {
	candidates: SupplierCandidate[];
	provider: 'mock-v1';
}

export const matchSupplierCapability: FinanceCapability<MatchSupplierInput, MatchSupplierOutput> = {
	id: 'finance.match-supplier',
	description: 'Find candidate suppliers for an invoice based on extracted counterparty name.',
	riskLevel: 'R1',
	inputSchema: matchSupplierInputSchema,

	async execute(input) {
		const query = input.counterpartyName ?? '';
		const candidates = MOCK_SUPPLIER_DIRECTORY.map((supplier) => ({
			id: supplier.id,
			name: supplier.name,
			matchScore: scoreSupplier(query, supplier),
			recentInvoiceCount: supplier.recentInvoiceCount
		}))
			.filter((candidate) => candidate.matchScore > 0)
			.sort((a, b) => b.matchScore - a.matchScore)
			.slice(0, 3);
		return { candidates, provider: 'mock-v1' };
	}
};
