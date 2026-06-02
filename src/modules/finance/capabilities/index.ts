import { detectDuplicateCapability } from './detect-duplicate';
import { extractDocumentFieldsCapability } from './extract-document-fields';
import { extractInvoiceFieldsCapability } from './extract-invoice-fields';
import { matchPurchaseOrderCapability } from './match-purchase-order';
import { matchSupplierCapability } from './match-supplier';
import { suggestNextFinanceTaskCapability } from './suggest-next-task';
import { validateExpenseDraftCapability } from './validate-expense-draft';

export {
	financeAgentActionSets,
	financeAllAgentActions,
	type FinanceAgentActionSets
} from './agent-actions';

export type {
	FinanceCapability,
	FinanceCapabilityContext,
	FinanceCapabilityDescriptor
} from './types';

export {
	extractInvoiceFieldsCapability,
	type ExtractInvoiceFieldsInput,
	type ExtractInvoiceFieldsOutput,
	type ExtractedInvoiceFields
} from './extract-invoice-fields';
export {
	extractDocumentFieldsCapability,
	type ExtractDocumentFieldsInput,
	type ExtractDocumentFieldsOutput
} from './extract-document-fields';
export {
	matchSupplierCapability,
	type MatchSupplierInput,
	type MatchSupplierOutput,
	type SupplierCandidate
} from './match-supplier';
export {
	matchPurchaseOrderCapability,
	type MatchPurchaseOrderInput,
	type MatchPurchaseOrderOutput,
	type PurchaseOrderCandidate
} from './match-purchase-order';
export {
	detectDuplicateCapability,
	type DetectDuplicateInput,
	type DetectDuplicateOutput,
	type DuplicateCandidatePayload
} from './detect-duplicate';
export {
	validateExpenseDraftCapability,
	type ValidateExpenseDraftInput,
	type ValidateExpenseDraftOutput
} from './validate-expense-draft';
export {
	suggestNextFinanceTaskCapability,
	type SuggestNextTaskInput,
	type SuggestNextTaskOutput,
	type SuggestedNextTask
} from './suggest-next-task';

export const financeCapabilities = [
	extractInvoiceFieldsCapability,
	extractDocumentFieldsCapability,
	matchSupplierCapability,
	matchPurchaseOrderCapability,
	detectDuplicateCapability,
	validateExpenseDraftCapability,
	suggestNextFinanceTaskCapability
] as const;

export const financeCapabilityIds = financeCapabilities.map((capability) => capability.id);
