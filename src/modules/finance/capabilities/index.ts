import { classifyDocumentCategoryCapability } from './classify-document-category';
import { extractDocumentFieldsCapability } from './extract-document-fields';
import { matchPurchaseOrderCapability } from './match-purchase-order';
import { matchSupplierCapability } from './match-supplier';
import { suggestNextFinanceTaskCapability } from './suggest-next-task';

export type {
	FinanceCapability,
	FinanceCapabilityContext,
	FinanceCapabilityDescriptor,
	FinanceCapabilityDeps,
	SuggestedNextTask,
	SupplierLookupResult,
	PurchaseOrderLookupResult
} from './types';

export {
	extractDocumentFieldsCapability,
	type ExtractDocumentFieldsInput,
	type ExtractDocumentFieldsOutput
} from './extract-document-fields';
export {
	classifyDocumentCategoryCapability,
	type ClassifyDocumentCategoryInput,
	type ClassifyDocumentCategoryOutput
} from './classify-document-category';
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
	suggestNextFinanceTaskCapability,
	type SuggestNextTaskInput,
	type SuggestNextTaskOutput
} from './suggest-next-task';

export const financeCapabilities = [
	extractDocumentFieldsCapability,
	classifyDocumentCategoryCapability,
	matchSupplierCapability,
	matchPurchaseOrderCapability,
	suggestNextFinanceTaskCapability
] as const;

export const financeCapabilityIds = financeCapabilities.map((capability) => capability.id);
