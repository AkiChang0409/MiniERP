import type { DBClient } from '$infrastructure/db';
import type { AuthRole } from '../auth/config';
import { appendAgentAuditEntry } from '../audit/audit-log';
import { executeCapability, type PlatformCapabilityContext } from './capability-registry';
import { checkToolPolicy, type PolicyDecision } from './tool-policy';

/**
 * Single governed entry point for invoking a capability: policy gate + audit +
 * execute, in one place. Replaces the hand-written `checkToolPolicy` +
 * `appendAgentAuditEntry` + `executeCapability`/runner sequences that were
 * duplicated across routes and the finance workflow orchestrator.
 *
 * Platform-internal (imports only platform + infrastructure); the workflow
 * engine and any agent loop call this instead of re-implementing gate/audit.
 */
export interface GovernedRunContext {
	agentId: string;
	agentVersion: string;
	userId: string | null;
	userEmail: string | null;
	userRoles?: AuthRole[] | null;
	tenantId: string;
	workflowId?: string;
	workflowStep?: string;
	currentStepAllowedCapabilities?: readonly string[];
	confirmationRef?: string;
	/** DB handle for the audit log write. */
	db: DBClient;
	/** Context handed to the capability's `execute()`. */
	capabilityCtx: PlatformCapabilityContext;
}

export type GovernedRunResult =
	| { ok: true; output: unknown; decision: PolicyDecision; auditId?: string }
	| { ok: false; decision: PolicyDecision };

export async function runGovernedCapability(
	capabilityId: string,
	input: unknown,
	gctx: GovernedRunContext
): Promise<GovernedRunResult> {
	const decision = checkToolPolicy({
		agentId: gctx.agentId,
		capabilityId,
		userRoles: gctx.userRoles,
		currentStepAllowedCapabilities: gctx.currentStepAllowedCapabilities,
		confirmationRef: gctx.confirmationRef
	});

	if (!decision.allowed) {
		if (decision.requiresAudit) {
			await appendAgentAuditEntry(gctx.db, {
				agentId: gctx.agentId,
				agentVersion: gctx.agentVersion,
				userId: gctx.userId,
				userEmail: gctx.userEmail,
				tenantId: gctx.tenantId,
				workflowId: gctx.workflowId,
				workflowStep: gctx.workflowStep,
				toolId: capabilityId,
				riskLevel: decision.riskLevel,
				permissionResult: 'denied',
				confirmationRequired: decision.requiresConfirmation,
				finalAction: 'agent.policy_denied',
				status: 'denied',
				errorCode: decision.blockedBy.join(',')
			});
		}
		return { ok: false, decision };
	}

	const output = await executeCapability(capabilityId, input, gctx.capabilityCtx);

	let auditId: string | undefined;
	if (decision.requiresAudit) {
		const audit = await appendAgentAuditEntry(gctx.db, {
			agentId: gctx.agentId,
			agentVersion: gctx.agentVersion,
			userId: gctx.userId,
			userEmail: gctx.userEmail,
			tenantId: gctx.tenantId,
			workflowId: gctx.workflowId,
			workflowStep: gctx.workflowStep,
			toolId: capabilityId,
			riskLevel: decision.riskLevel,
			permissionResult: 'allowed',
			confirmationRequired: decision.requiresConfirmation,
			confirmationRef: gctx.confirmationRef,
			finalAction: 'agent.capability_call',
			status: 'ok'
		});
		auditId = audit.auditId;
	}

	return { ok: true, output, decision, auditId };
}
