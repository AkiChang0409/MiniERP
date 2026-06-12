import type { FinanceRiskLevel } from '../../agent/types';

export type VendorInvoiceIntakeStepId =
	| 'trigger'
	| 'document_intake'
	| 'invoice_field_extraction'
	| 'matching'
	| 'user_confirmation'
	| 'record_creation'
	| 'completion';

export interface VendorInvoiceIntakeStep {
	id: VendorInvoiceIntakeStepId;
	allowedCapabilities: readonly string[];
	riskLevel: FinanceRiskLevel;
	requiresUserConfirmation: boolean;
	nextSteps: readonly VendorInvoiceIntakeStepId[];
}

export interface VendorInvoiceIntakeWorkflowDefinition {
	id: 'vendor-invoice-intake';
	description: string;
	initialStep: VendorInvoiceIntakeStepId;
	steps: readonly VendorInvoiceIntakeStep[];
}

export const vendorInvoiceIntakeWorkflow: VendorInvoiceIntakeWorkflowDefinition = {
	id: 'vendor-invoice-intake',
	description: 'Supplier invoice intake and verification workflow',
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
			nextSteps: ['invoice_field_extraction']
		},
		{
			id: 'invoice_field_extraction',
			allowedCapabilities: ['finance.extract-document-fields'],
			riskLevel: 'R2',
			requiresUserConfirmation: false,
			nextSteps: ['matching']
		},
		{
			id: 'matching',
			allowedCapabilities: ['finance.match-supplier', 'finance.match-purchase-order'],
			riskLevel: 'R1',
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
			allowedCapabilities: ['finance.create-expense-record'],
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

export function findVendorInvoiceIntakeStep(
	stepId: VendorInvoiceIntakeStepId
): VendorInvoiceIntakeStep | undefined {
	return vendorInvoiceIntakeWorkflow.steps.find((step) => step.id === stepId);
}
