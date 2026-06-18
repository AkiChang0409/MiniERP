import { answerFinanceQuestionCapability } from './answer-question';
import { classifyDocumentCategoryCapability } from './classify-document-category';
import { createExpenseRecordCapability } from './create-expense-record';
import { createRevenueRecordCapability } from './create-revenue-record';
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
export {
	answerFinanceQuestionCapability,
	type AnswerFinanceQuestionInput,
	type AnswerFinanceQuestionOutput
} from './answer-question';
export {
	createExpenseRecordCapability,
	type CreateExpenseRecordInput,
	type CreateExpenseRecordOutput
} from './create-expense-record';
export {
	createRevenueRecordCapability,
	type CreateRevenueRecordInput,
	type CreateRevenueRecordOutput
} from './create-revenue-record';

export const financeCapabilities = [
	extractDocumentFieldsCapability,
	classifyDocumentCategoryCapability,
	matchSupplierCapability,
	matchPurchaseOrderCapability,
	suggestNextFinanceTaskCapability,
	answerFinanceQuestionCapability,
	// R4 governed writes (plan Phase 8) — used by confirmInbox via the governed runtime.
	createExpenseRecordCapability,
	createRevenueRecordCapability
] as const;

export const financeCapabilityIds = financeCapabilities.map((capability) => capability.id);
