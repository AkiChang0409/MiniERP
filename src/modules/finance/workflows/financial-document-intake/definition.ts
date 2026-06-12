import type { FinanceRiskLevel } from '../../agent/types';

/**
 * financial-document-intake — the unified Phase 3 workflow that subsumes the
 * narrow Phase-1 vendor-invoice-intake. Aligned with
 * ref_files/smartfin-expense-revenue-design.md §1.2 ("统一入口") and the
 * existing AI Panel intake step shape (Drop → Classify → Bucket → Kind →
 * Project → Review).
 *
 * The legacy `vendor-invoice-intake` definition stays alongside this one
 * for now; the AI Panel will migrate to this workflow in a later stage.
 */
export type FinancialDocumentIntakeStepId =
	| 'trigger'
	| 'document_intake'
	| 'bucket_selection'
	| 'category_selection'
	| 'field_extraction'
	| 'matching'
	| 'project_selection'
	| 'user_confirmation'
	| 'record_creation'
	| 'completion';

export interface FinancialDocumentIntakeStep {
	id: FinancialDocumentIntakeStepId;
	allowedCapabilities: readonly string[];
	riskLevel: FinanceRiskLevel;
	requiresUserConfirmation: boolean;
	nextSteps: readonly FinancialDocumentIntakeStepId[];
}

export interface FinancialDocumentIntakeWorkflowDefinition {
	id: 'financial-document-intake';
	description: string;
	initialStep: FinancialDocumentIntakeStepId;
	steps: readonly FinancialDocumentIntakeStep[];
}

export const financialDocumentIntakeWorkflow: FinancialDocumentIntakeWorkflowDefinition = {
	id: 'financial-document-intake',
	description:
		'Unified intake for any financial document — supplier invoice, receipt, PO, customer invoice, contract, quotation. Branches by user-selected (bucket, category, docType).',
	initialStep: 'trigger',
	steps: [
		{
			id: 'trigger',
			allowedCapabilities: [],
			riskLevel: 'R0',
			requiresUserConfirmation: false,
			nextSteps: ['document_intake']
		},
		{
			id: 'document_intake',
			allowedCapabilities: [],
			riskLevel: 'R1',
			requiresUserConfirmation: false,
			nextSteps: ['bucket_selection']
		},
		{
			id: 'bucket_selection',
			allowedCapabilities: [],
			riskLevel: 'R0',
			requiresUserConfirmation: false,
			nextSteps: ['category_selection']
		},
		{
			id: 'category_selection',
			allowedCapabilities: [],
			riskLevel: 'R0',
			requiresUserConfirmation: false,
			nextSteps: ['field_extraction']
		},
		{
			id: 'field_extraction',
			allowedCapabilities: ['finance.extract-document-fields'],
			riskLevel: 'R2',
			requiresUserConfirmation: false,
			nextSteps: ['matching', 'project_selection', 'user_confirmation']
		},
		{
			id: 'matching',
			allowedCapabilities: ['finance.match-supplier', 'finance.match-purchase-order'],
			riskLevel: 'R1',
			requiresUserConfirmation: false,
			nextSteps: ['project_selection', 'user_confirmation']
		},
		{
			id: 'project_selection',
			allowedCapabilities: [],
			riskLevel: 'R0',
			requiresUserConfirmation: false,
			nextSteps: ['user_confirmation']
		},
		{
			id: 'user_confirmation',
			allowedCapabilities: [],
			riskLevel: 'R3',
			requiresUserConfirmation: true,
			nextSteps: ['record_creation']
		},
		{
			id: 'record_creation',
			allowedCapabilities: [
				'finance.create-expense-record',
				'finance.create-revenue-record',
				'finance.create-document-archive'
			],
			riskLevel: 'R4',
			requiresUserConfirmation: true,
			nextSteps: ['completion']
		},
		{
			id: 'completion',
			allowedCapabilities: ['finance.suggest-next-finance-task'],
			riskLevel: 'R0',
			requiresUserConfirmation: false,
			nextSteps: []
		}
	]
};

export function findFinancialDocumentIntakeStep(
	id: FinancialDocumentIntakeStepId
): FinancialDocumentIntakeStep | undefined {
	return financialDocumentIntakeWorkflow.steps.find((step) => step.id === id);
}
