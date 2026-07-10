import type { AuthRole } from '../auth/config';
import { lookupCapability, type PlatformRiskLevel } from './capability-registry';

export type PolicyBlockReason =
	| 'tool_not_registered'
	| 'tool_disabled'
	| 'agent_permission'
	| 'user_permission'
	| 'workflow_step'
	| 'risk_policy'
	| 'confirmation_missing';

export interface PolicyDecision {
	allowed: boolean;
	reason?: string;
	riskLevel: PlatformRiskLevel;
	requiresConfirmation: boolean;
	requiresAudit: boolean;
	requiredUserPermissions: string[];
	missingUserPermissions: string[];
	allowedWorkflowStep?: boolean;
	blockedBy: PolicyBlockReason[];
}

export interface PolicyCheckInput {
	agentId: string;
	capabilityId: string;
	userRoles: AuthRole[] | null | undefined;
	currentStepAllowedCapabilities?: readonly string[];
	confirmationRef?: string;
}

const PERMISSION_TO_ROLES: Record<string, readonly AuthRole[]> = {
	'finance:view': ['owner', 'admin', 'finance', 'project_manager', 'employee'],
	'finance:edit': ['owner', 'admin', 'finance'],
	'finance:tax': ['owner', 'admin', 'finance'],
	'project:view': ['owner', 'admin', 'project_manager', 'employee', 'staff'],
	'project:edit': ['owner', 'admin', 'project_manager'],
	'project:staff': ['owner', 'admin', 'project_manager'],
	'hr:view': ['owner', 'admin', 'hr'],
	'hr:edit': ['owner', 'admin', 'hr'],
	'hr:approve': ['owner', 'admin', 'hr'],
	'inventory:view': ['owner', 'admin'],
	'sales-crm:view': ['owner', 'admin'],
	'sales-crm:edit': ['owner', 'admin']
};

export function rolesHavePermission(roles: AuthRole[] | null | undefined, permission: string): boolean {
	if (!roles || roles.length === 0) return false;
	const allowed = PERMISSION_TO_ROLES[permission];
	if (!allowed) return false;
	return roles.some((r) => allowed.includes(r));
}

const ACCEPTABLE_RISK: ReadonlySet<PlatformRiskLevel> = new Set<PlatformRiskLevel>([
	'R0',
	'R1',
	'R2',
	'R3',
	'R4'
]);

export function checkToolPolicy(input: PolicyCheckInput): PolicyDecision {
	const blockedBy: PolicyBlockReason[] = [];
	const requiredUserPermissions: string[] = [];
	const missingUserPermissions: string[] = [];

	const entry = lookupCapability(input.capabilityId);
	if (!entry) {
		return {
			allowed: false,
			reason: `Capability not registered: ${input.capabilityId}`,
			riskLevel: 'R0',
			requiresConfirmation: false,
			requiresAudit: false,
			requiredUserPermissions: [],
			missingUserPermissions: [],
			blockedBy: ['tool_not_registered']
		};
	}

	const manifest = entry.manifest;
	requiredUserPermissions.push(...manifest.requiredUserPermissions);

	if (!manifest.enabled) blockedBy.push('tool_disabled');

	if (!manifest.allowedAgents.includes(input.agentId)) blockedBy.push('agent_permission');

	for (const permission of manifest.requiredUserPermissions) {
		if (!rolesHavePermission(input.userRoles, permission)) {
			missingUserPermissions.push(permission);
		}
	}
	if (missingUserPermissions.length > 0) blockedBy.push('user_permission');

	let allowedWorkflowStep: boolean | undefined;
	if (input.currentStepAllowedCapabilities) {
		allowedWorkflowStep = input.currentStepAllowedCapabilities.includes(input.capabilityId);
		if (!allowedWorkflowStep) blockedBy.push('workflow_step');
	}

	if (!ACCEPTABLE_RISK.has(manifest.riskLevel)) blockedBy.push('risk_policy');

	if (manifest.requiresConfirmation && !input.confirmationRef) {
		blockedBy.push('confirmation_missing');
	}

	const allowed = blockedBy.length === 0;
	return {
		allowed,
		reason: allowed ? undefined : `Blocked by: ${blockedBy.join(', ')}`,
		riskLevel: manifest.riskLevel,
		requiresConfirmation: manifest.requiresConfirmation,
		requiresAudit: manifest.auditRequired,
		requiredUserPermissions,
		missingUserPermissions,
		allowedWorkflowStep,
		blockedBy
	};
}
