import type { FinanceForbiddenAction, FinanceRiskLevel } from './types';

export interface FinanceCapabilityPolicyEntry {
	id: string;
	riskLevel: FinanceRiskLevel;
	requiresConfirmation: boolean;
	requiredUserPermissions: string[];
}

/**
 * Capability allow-list for the Finance Agent. Stage 2 lands the actual
 * capability implementations under `src/modules/finance/capabilities/*`;
 * the ids here are the contract those folders must register against.
 */
export const financeAgentAllowedCapabilities: FinanceCapabilityPolicyEntry[] = [
	{
		id: 'finance.extract-invoice-fields',
		riskLevel: 'R2',
		requiresConfirmation: false,
		requiredUserPermissions: ['finance:edit']
	},
	{
		id: 'finance.extract-document-fields',
		riskLevel: 'R2',
		requiresConfirmation: false,
		requiredUserPermissions: ['finance:edit']
	},
	{
		id: 'finance.match-supplier',
		riskLevel: 'R1',
		requiresConfirmation: false,
		requiredUserPermissions: ['finance:view']
	},
	{
		id: 'finance.match-purchase-order',
		riskLevel: 'R1',
		requiresConfirmation: false,
		requiredUserPermissions: ['finance:view']
	},
	{
		id: 'finance.detect-duplicate',
		riskLevel: 'R1',
		requiresConfirmation: false,
		requiredUserPermissions: ['finance:view']
	},
	{
		id: 'finance.validate-expense-draft',
		riskLevel: 'R2',
		requiresConfirmation: false,
		requiredUserPermissions: ['finance:edit']
	},
	{
		id: 'finance.create-expense-record',
		riskLevel: 'R4',
		requiresConfirmation: true,
		requiredUserPermissions: ['finance:edit']
	},
	{
		id: 'finance.suggest-next-finance-task',
		riskLevel: 'R1',
		requiresConfirmation: false,
		requiredUserPermissions: ['finance:view']
	},
	{
		id: 'finance.explain-expense-decision',
		riskLevel: 'R0',
		requiresConfirmation: false,
		requiredUserPermissions: ['finance:view']
	}
];

/**
 * R5 actions the Finance Agent must refuse outright. The platform tool-policy
 * (Stage 3) consults this list before any capability dispatch.
 */
export const financeAgentForbiddenActions: readonly FinanceForbiddenAction[] = [
	'delete_record',
	'execute_payment',
	'submit_tax_return',
	'change_permission',
	'change_bank_account',
	'bypass_workflow',
	'bypass_validation'
];

export function findCapabilityPolicy(
	capabilityId: string
): FinanceCapabilityPolicyEntry | undefined {
	return financeAgentAllowedCapabilities.find((entry) => entry.id === capabilityId);
}

export function isForbiddenAction(action: string): action is FinanceForbiddenAction {
	return (financeAgentForbiddenActions as readonly string[]).includes(action);
}

/**
 * Refusal copy per doc 03 §14. Returned verbatim by the agent when an R5
 * action is requested; never reaches a service.
 */
export const financeAgentRefusalCopy: Record<FinanceForbiddenAction, string> = {
	delete_record:
		'I cannot delete financial records directly. Open the record and use the manual delete flow if your role permits it.',
	execute_payment:
		'I cannot execute payments. Use the payment workflow in the main finance area.',
	submit_tax_return:
		'I can help prepare and review the GST summary, but I cannot submit the tax return directly.',
	change_permission:
		'Permission changes are not part of what I can do. Ask an administrator to update access.',
	change_bank_account:
		'Bank account changes must go through the manual settings flow with proper approval.',
	bypass_workflow:
		'I cannot skip workflow steps. Each finance action goes through validation and confirmation.',
	bypass_validation:
		'I cannot bypass validation. Please correct the highlighted fields or mark the item for manual review.'
};
