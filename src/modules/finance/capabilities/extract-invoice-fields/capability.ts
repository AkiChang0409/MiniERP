import type { FinanceEvidence } from '../../agent/types';
import { runStructuredOutput } from '../../../../platform/ai/ai-runtime';
import type { FinanceCapability, FinanceCapabilityContext } from '../types';
import { extractInvoiceFieldsInputSchema } from './schema';
import { runHeuristicExtraction, type HeuristicResult } from './heuristic';
import {
	buildEvidence,
	pickFixture,
	type ExtractedInvoiceFields,
	type ExtractInvoiceFieldsInput,
	type ExtractInvoiceFieldsOutput,
	type ExtractionProvider
} from './mock';
import {
	buildInvoiceExtractionUserPrompt,
	INVOICE_EXTRACTION_PROMPT_VERSION,
	INVOICE_EXTRACTION_SYSTEM_PROMPT
} from './prompt.v1';
import {
	INVOICE_EXTRACTION_SCHEMA_NAME,
	INVOICE_EXTRACTION_SCHEMA_VERSION,
	invoiceExtractionLlmSchemaV1,
	type InvoiceExtractionLlmV1
} from './schema.v1';

const HEURISTIC_ACCEPT_THRESHOLD = 0.65;
const MIN_TEXT_LENGTH_FOR_REAL_EXTRACT = 32;

interface CapabilityContextWithEnv extends FinanceCapabilityContext {
	env?: Env;
}

function buildEvidenceForReal(provider: ExtractionProvider): FinanceEvidence[] {
	const fields: Array<keyof ExtractedInvoiceFields> = [
		'documentNumber',
		'counterpartyName',
		'currency',
		'totalAmount',
		'gstAmount',
		'issueDate',
		'dueDate'
	];
	return fields.map((field) => ({
		type: 'extracted_field',
		refId: `${provider}://${field}`,
		summary: `Extracted ${field} via ${provider}`
	}));
}

function heuristicToFields(
	result: HeuristicResult
): ExtractedInvoiceFields | null {
	const f = result.fields;
	if (
		!f.invoiceNumber ||
		!f.supplierName ||
		f.totalAmount === null ||
		!f.issueDate ||
		!f.currency
	) {
		return null;
	}
	return {
		documentNumber: f.invoiceNumber,
		counterpartyName: f.supplierName,
		currency: f.currency.toUpperCase(),
		totalAmount: f.totalAmount,
		gstAmount: f.gstAmount ?? 0,
		issueDate: f.issueDate,
		dueDate: f.dueDate ?? f.issueDate
	};
}

function llmToFields(value: InvoiceExtractionLlmV1): ExtractedInvoiceFields | null {
	if (
		!value.invoiceNumber ||
		!value.supplierName ||
		value.totalAmount === null ||
		!value.issueDate ||
		!value.currency
	) {
		return null;
	}
	return {
		documentNumber: value.invoiceNumber,
		counterpartyName: value.supplierName,
		currency: value.currency.toUpperCase(),
		totalAmount: value.totalAmount,
		gstAmount: value.gstAmount ?? 0,
		issueDate: value.issueDate,
		dueDate: value.dueDate ?? value.issueDate
	};
}

async function tryLlmExtraction(
	text: string,
	ctx: CapabilityContextWithEnv,
	documentId: string
): Promise<{ fields: ExtractedInvoiceFields; confidence: number; provider: ExtractionProvider } | null> {
	if (!ctx.env?.AI) return null;

	const result = await runStructuredOutput<InvoiceExtractionLlmV1>({
		task: 'finance.extractInvoiceFields',
		messages: [
			{ role: 'system', content: INVOICE_EXTRACTION_SYSTEM_PROMPT },
			{ role: 'user', content: buildInvoiceExtractionUserPrompt(text) }
		],
		schema: invoiceExtractionLlmSchemaV1,
		schemaName: INVOICE_EXTRACTION_SCHEMA_NAME,
		schemaVersion: INVOICE_EXTRACTION_SCHEMA_VERSION,
		modelHint: { capability: 'structured_extraction', priority: 'quality' },
		metadata: {
			tenantId: ctx.tenantId ?? 'default',
			userId: ctx.userId,
			capabilityId: 'finance.extract-invoice-fields',
			promptVersion: INVOICE_EXTRACTION_PROMPT_VERSION,
			schemaVersion: INVOICE_EXTRACTION_SCHEMA_VERSION,
			riskLevel: 'R2',
			inputRefs: [`document:${documentId}`]
		},
		env: ctx.env
	});

	if (result.status !== 'success') return null;
	const fields = llmToFields(result.result.value);
	if (!fields) return null;
	const provider: ExtractionProvider =
		result.result.meta.providerId === 'workers_ai' ? 'workers_ai' : 'external_api';
	const confidence = result.result.value.confidence ?? 0.8;
	return { fields, confidence, provider };
}

export const extractInvoiceFieldsCapability: FinanceCapability<
	ExtractInvoiceFieldsInput,
	ExtractInvoiceFieldsOutput
> = {
	id: 'finance.extract-invoice-fields',
	description: 'Extract invoice fields (number, supplier, amount, GST, dates) from a document.',
	riskLevel: 'R2',
	inputSchema: extractInvoiceFieldsInputSchema,

	async execute(input, ctx) {
		const ctxWithEnv = ctx as CapabilityContextWithEnv;

		// 1. No usable text → fall straight to fixture mock (Phase 1 demo path).
		if (!input.text || input.text.length < MIN_TEXT_LENGTH_FOR_REAL_EXTRACT) {
			const fixture = pickFixture(input);
			return {
				fields: fixture.fields,
				confidence: fixture.confidence,
				evidence: buildEvidence(fixture.fields),
				provider: 'mock-v1'
			};
		}

		// 2. Heuristic-first over real text.
		const heuristic = runHeuristicExtraction(input.text);
		if (heuristic.confidence >= HEURISTIC_ACCEPT_THRESHOLD) {
			const fields = heuristicToFields(heuristic);
			if (fields) {
				return {
					fields,
					confidence: heuristic.confidence,
					evidence: buildEvidenceForReal('heuristic'),
					provider: 'heuristic'
				};
			}
		}

		// 3. LLM fallback (gated on AI binding presence).
		const llm = await tryLlmExtraction(input.text, ctxWithEnv, input.documentId);
		if (llm) {
			return {
				fields: llm.fields,
				confidence: llm.confidence,
				evidence: buildEvidenceForReal(llm.provider),
				provider: llm.provider
			};
		}

		// 4. If heuristic produced something usable but below threshold, prefer
		//    it over a fixture mock so the user at least sees something derived
		//    from their real document.
		const fields = heuristicToFields(heuristic);
		if (fields) {
			return {
				fields,
				confidence: heuristic.confidence,
				evidence: buildEvidenceForReal('heuristic'),
				provider: 'heuristic'
			};
		}

		// 5. Final fallback: filename-keyed fixture so the demo keeps moving
		//    even when a real upload + extraction yielded nothing.
		const fixture = pickFixture(input);
		return {
			fields: fixture.fields,
			confidence: fixture.confidence,
			evidence: buildEvidence(fixture.fields),
			provider: 'mock-v1'
		};
	}
};
