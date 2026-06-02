/**
 * Application composition root for active AI capability registration.
 *
 * Platform owns the registry and policy checks; concrete capabilities are
 * selected here so platform does not import domain modules.
 */
import { classifyDocumentCapability } from '$modules/document-intake/capabilities/classify-document';
import { financeAgentAllowedCapabilities } from '$modules/finance/agent';
import {
	detectDuplicateCapability,
	extractDocumentFieldsCapability,
	extractInvoiceFieldsCapability,
	matchPurchaseOrderCapability,
	matchSupplierCapability,
	suggestNextFinanceTaskCapability,
	validateExpenseDraftCapability
} from '$modules/finance/capabilities';
import {
	registerCapabilities,
	type CapabilityRegistration
} from '$platform/ai/register-all';

const FINANCE_AGENT_ID = 'finance-agent';

const financeCapabilities = [
	extractInvoiceFieldsCapability,
	extractDocumentFieldsCapability,
	matchSupplierCapability,
	matchPurchaseOrderCapability,
	detectDuplicateCapability,
	validateExpenseDraftCapability,
	suggestNextFinanceTaskCapability
];

const registrations: CapabilityRegistration[] = financeCapabilities.map((capability) => {
	const policyEntry = financeAgentAllowedCapabilities.find((entry) => entry.id === capability.id);
	if (!policyEntry) {
		throw new Error(
			`No policy entry for finance capability ${capability.id}. Update finance/agent/policy.ts.`
		);
	}
	return {
		manifest: {
			id: capability.id,
			ownerModule: 'finance',
			description: capability.description,
			riskLevel: policyEntry.riskLevel,
			allowedAgents: [FINANCE_AGENT_ID],
			requiredUserPermissions: policyEntry.requiredUserPermissions,
			requiresConfirmation: policyEntry.requiresConfirmation,
			auditRequired: true,
			enabled: true
		},
		capability
	};
});

// Document Intake pre-registers classify-document for the future Document Agent.
registrations.push({
	manifest: {
		id: classifyDocumentCapability.id,
		ownerModule: 'document-intake',
		description: classifyDocumentCapability.description,
		riskLevel: classifyDocumentCapability.riskLevel,
		allowedAgents: ['document-agent'],
		requiredUserPermissions: ['finance:view'],
		requiresConfirmation: false,
		auditRequired: true,
		enabled: true
	},
	capability: classifyDocumentCapability
});

registerCapabilities(registrations);
