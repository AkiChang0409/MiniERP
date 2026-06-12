/**
 * Demo/unit fixture fallback for field extraction. Used only when there is no
 * usable OCR text or no runtime AI binding (see `capability.ts`), so a local
 * demo without Workers AI still produces something. Relocated here from the
 * former `extract-invoice-fields` capability when that Phase-2 capability was
 * retired in favour of the generalized `extract-document-fields`.
 */
import type { FinanceEvidence } from '../../agent/types';

export type ExtractionProvider = 'mock-v1' | 'heuristic' | 'workers_ai' | 'external_api' | 'none';

export interface FixtureFields {
	documentNumber: string;
	counterpartyName: string;
	currency: string;
	totalAmount: number;
	gstAmount: number;
	issueDate: string;
	dueDate: string;
}

interface Fixture {
	keywords: string[];
	fields: FixtureFields;
	confidence: number;
}

const FIXTURES: Fixture[] = [
	{
		keywords: ['axiom'],
		fields: {
			documentNumber: 'INV-2026-0148',
			counterpartyName: 'Axiom Tech',
			currency: 'SGD',
			totalAmount: 12450,
			gstAmount: 1028.44,
			issueDate: '2026-04-22',
			dueDate: '2026-05-22'
		},
		confidence: 0.94
	},
	{
		keywords: ['cloudfactor', 'cloud'],
		fields: {
			documentNumber: 'CF-2026-Q2-0072',
			counterpartyName: 'Cloudfactor SG',
			currency: 'SGD',
			totalAmount: 4860,
			gstAmount: 401.65,
			issueDate: '2026-04-18',
			dueDate: '2026-05-18'
		},
		confidence: 0.91
	},
	{
		keywords: ['neon', 'robotics'],
		fields: {
			documentNumber: 'NR-2026-1140',
			counterpartyName: 'Neon Robotics',
			currency: 'SGD',
			totalAmount: 27800,
			gstAmount: 2296.33,
			issueDate: '2026-04-15',
			dueDate: '2026-05-30'
		},
		confidence: 0.88
	}
];

const DEFAULT_FIXTURE = FIXTURES[0];

export function pickFixture(input: { documentId: string; fileName?: string }): Fixture {
	const haystack = `${input.fileName ?? ''} ${input.documentId}`.toLowerCase();
	const matched = FIXTURES.find((f) => f.keywords.some((k) => haystack.includes(k)));
	return matched ?? DEFAULT_FIXTURE;
}

export function buildEvidence(fields: FixtureFields): FinanceEvidence[] {
	return Object.keys(fields).map((field) => ({
		type: 'extracted_field' as const,
		refId: `mock://${field}`,
		summary: `Extracted ${field} from invoice text`
	}));
}
