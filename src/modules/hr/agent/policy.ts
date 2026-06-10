import type { CapabilitySideEffect, PlatformRiskLevel } from '$platform/ai/capability-registry';

export const HR_AGENT_ID = 'hr-agent';

export interface HrCapabilityPolicyEntry {
	id: string;
	riskLevel: PlatformRiskLevel;
	sideEffect: CapabilitySideEffect;
	requiresConfirmation: boolean;
	/**
	 * Permissions checked by tool-policy. Empty = self-service: any authenticated
	 * user may call, identity is enforced by personId binding inside the
	 * capability, not by role.
	 */
	requiredUserPermissions: string[];
	persistTarget?: string;
}

/**
 * Capability allow-list for the HR Agent. The ids here are the contract the
 * `src/modules/hr/capabilities/*` folders register against (see
 * `src/app/bootstrap/register-ai-capabilities.ts`).
 *
 * Invariant honored: every `sideEffect: 'write'` entry sets
 * `requiresConfirmation: true` (also enforced at registration time).
 */
export const hrAgentAllowedCapabilities: HrCapabilityPolicyEntry[] = [
	{
		id: 'hr.list-pending-leave',
		riskLevel: 'R1',
		sideEffect: 'read',
		requiresConfirmation: false,
		requiredUserPermissions: ['hr:view']
	},
	{
		id: 'hr.submit-leave-request',
		riskLevel: 'R4',
		sideEffect: 'write',
		requiresConfirmation: true,
		// Self-service: gated by personId binding, not by an HR management role.
		requiredUserPermissions: [],
		persistTarget: 'leave_requests'
	},
	{
		id: 'hr.approve-leave-request',
		riskLevel: 'R4',
		sideEffect: 'write',
		requiresConfirmation: true,
		requiredUserPermissions: ['hr:approve'],
		persistTarget: 'leave_requests'
	}
];

export function findHrCapabilityPolicy(capabilityId: string): HrCapabilityPolicyEntry | undefined {
	return hrAgentAllowedCapabilities.find((entry) => entry.id === capabilityId);
}
