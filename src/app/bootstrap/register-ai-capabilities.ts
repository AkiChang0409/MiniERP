/**
 * Application composition root for active AI capability registration.
 *
 * Platform owns the registry and policy checks; concrete capabilities are
 * selected here so platform does not import domain modules.
 */
import { classifyDocumentCapability } from '$modules/document-intake/capabilities/classify-document';
import { financeAgentAllowedCapabilities } from '$modules/finance/agent';
import { financeCapabilities } from '$modules/finance/capabilities';
import { HR_AGENT_ID, hrAgentAllowedCapabilities } from '$modules/hr/agent';
import {
	approveLeaveRequestCapability,
	listPendingLeaveCapability,
	submitLeaveRequestCapability,
	type HrCapability
} from '$modules/hr/capabilities';
import { PROJECT_AGENT_ID, projectAgentAllowedCapabilities } from '$modules/project/agent';
import { projectCapabilities, type ProjectCapability } from '$modules/project/capabilities';
import {
	registerCapabilities,
	type CapabilityRegistration
} from '$platform/ai/register-all';

const FINANCE_AGENT_ID = 'finance-agent';

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
			enabled: true,
			// A capability that requires confirmation is, by definition, a write;
			// this keeps the write⇒requiresConfirmation invariant true by construction.
			sideEffect: policyEntry.requiresConfirmation ? 'write' : 'read',
			// Lift the capability's Zod input schema so the guarded executor can
			// validate LLM / confirm-path tool input before dispatch, and the
			// write target for audit/impact.
			inputSchema: capability.inputSchema,
			persistTarget: policyEntry.persistTarget
		},
		capability
	};
});

// HR Agent (Phase 1): leave list / submit / approve. Each manifest lifts the
// capability's Zod input/output schemas + the policy entry's risk/permission/
// sideEffect. The write⇒requiresConfirmation invariant is enforced at register.
const hrCapabilities: HrCapability<unknown, unknown>[] = [
	listPendingLeaveCapability,
	submitLeaveRequestCapability,
	approveLeaveRequestCapability
];

for (const capability of hrCapabilities) {
	const policyEntry = hrAgentAllowedCapabilities.find((entry) => entry.id === capability.id);
	if (!policyEntry) {
		throw new Error(
			`No policy entry for HR capability ${capability.id}. Update hr/agent/policy.ts.`
		);
	}
	registrations.push({
		manifest: {
			id: capability.id,
			ownerModule: 'hr',
			description: capability.description,
			riskLevel: policyEntry.riskLevel,
			allowedAgents: [HR_AGENT_ID],
			requiredUserPermissions: policyEntry.requiredUserPermissions,
			requiresConfirmation: policyEntry.requiresConfirmation,
			auditRequired: true,
			enabled: true,
			sideEffect: policyEntry.sideEffect,
			inputSchema: capability.inputSchema,
			outputSchema: capability.outputSchema,
			persistTarget: policyEntry.persistTarget,
			idempotencyKey: capability.idempotencyKey
		},
		capability
	});
}

// Project Agent: the module's suggestive AI helpers (plan / dashboard summary /
// project Q&A / task extraction / meeting agenda + notes). Each manifest lifts
// the capability's Zod input/output schemas + the policy entry's risk /
// permission / sideEffect. All are read-only, so the write⇒requiresConfirmation
// invariant holds trivially.
for (const capability of projectCapabilities as readonly ProjectCapability<unknown, unknown>[]) {
	const policyEntry = projectAgentAllowedCapabilities.find((entry) => entry.id === capability.id);
	if (!policyEntry) {
		throw new Error(
			`No policy entry for project capability ${capability.id}. Update project/agent/policy.ts.`
		);
	}
	registrations.push({
		manifest: {
			id: capability.id,
			ownerModule: 'project',
			description: capability.description,
			riskLevel: policyEntry.riskLevel,
			allowedAgents: [PROJECT_AGENT_ID],
			requiredUserPermissions: policyEntry.requiredUserPermissions,
			requiresConfirmation: policyEntry.requiresConfirmation,
			auditRequired: true,
			enabled: true,
			sideEffect: policyEntry.sideEffect,
			inputSchema: capability.inputSchema,
			outputSchema: capability.outputSchema
		},
		capability
	});
}

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
		enabled: true,
		sideEffect: 'read'
	},
	capability: classifyDocumentCapability
});

registerCapabilities(registrations);
