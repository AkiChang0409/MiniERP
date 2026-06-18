import type { CapabilitySideEffect, PlatformRiskLevel } from '$platform/ai/capability-registry';
import type { ProjectForbiddenAction } from './types';

export const PROJECT_AGENT_ID = 'project-agent';

export interface ProjectCapabilityPolicyEntry {
	id: string;
	riskLevel: PlatformRiskLevel;
	sideEffect: CapabilitySideEffect;
	requiresConfirmation: boolean;
	requiredUserPermissions: string[];
}

/**
 * Capability allow-list for the Project Agent. The ids here are the contract
 * the `src/modules/project/capabilities/*` folders register against (see
 * `src/app/bootstrap/register-ai-capabilities.ts`).
 *
 * Every project capability is AI/LLM-driven and read-only (suggestive output
 * the user reviews before any write), so each is `sideEffect: 'read'` and never
 * requires confirmation — the write⇒requiresConfirmation invariant holds by
 * construction. `project:view` for read/query helpers; `project:edit` for the
 * generative/extraction helpers whose output seeds editable drafts.
 */
export const projectAgentAllowedCapabilities: ProjectCapabilityPolicyEntry[] = [
	{
		id: 'project.generate-plan',
		riskLevel: 'R1',
		sideEffect: 'read',
		requiresConfirmation: false,
		requiredUserPermissions: ['project:edit']
	},
	{
		id: 'project.summarize-dashboard',
		riskLevel: 'R0',
		sideEffect: 'read',
		requiresConfirmation: false,
		requiredUserPermissions: ['project:view']
	},
	{
		id: 'project.answer-question',
		riskLevel: 'R0',
		sideEffect: 'read',
		requiresConfirmation: false,
		requiredUserPermissions: ['project:view']
	},
	{
		id: 'project.extract-tasks',
		riskLevel: 'R1',
		sideEffect: 'read',
		requiresConfirmation: false,
		requiredUserPermissions: ['project:edit']
	},
	{
		id: 'project.draft-meeting-agenda',
		riskLevel: 'R0',
		sideEffect: 'read',
		requiresConfirmation: false,
		requiredUserPermissions: ['project:edit']
	},
	{
		id: 'project.process-meeting-notes',
		riskLevel: 'R1',
		sideEffect: 'read',
		requiresConfirmation: false,
		requiredUserPermissions: ['project:edit']
	},
	{
		id: 'project.view-calendar',
		riskLevel: 'R1',
		sideEffect: 'read',
		requiresConfirmation: false,
		requiredUserPermissions: ['project:view']
	},
	// Stage-2 draft proposals (design §12): R3, read-only — they output a
	// reviewable change set, never a write. `requiresConfirmation` stays false
	// (nothing is persisted); the eventual *apply* is a separate R4 write
	// capability that requires confirmation (plan Phase 8).
	{
		id: 'project.propose-task-plan',
		riskLevel: 'R3',
		sideEffect: 'read',
		requiresConfirmation: false,
		requiredUserPermissions: ['project:edit']
	},
	{
		id: 'project.propose-reschedule',
		riskLevel: 'R3',
		sideEffect: 'read',
		requiresConfirmation: false,
		requiredUserPermissions: ['project:edit']
	},
	{
		id: 'project.propose-assignment',
		riskLevel: 'R3',
		sideEffect: 'read',
		requiresConfirmation: false,
		requiredUserPermissions: ['project:edit']
	},
	{
		id: 'project.detect-schedule-conflicts',
		riskLevel: 'R3',
		sideEffect: 'read',
		requiresConfirmation: false,
		requiredUserPermissions: ['project:edit']
	},
	// Stage-3 governed writes (design §12): R4, write, require confirmation. The
	// write⇒requiresConfirmation invariant is enforced at registration. update-task
	// also serves reschedule + assignment via its patch fields.
	{
		id: 'project.create-task',
		riskLevel: 'R4',
		sideEffect: 'write',
		requiresConfirmation: true,
		requiredUserPermissions: ['project:edit']
	},
	{
		id: 'project.update-task',
		riskLevel: 'R4',
		sideEffect: 'write',
		requiresConfirmation: true,
		requiredUserPermissions: ['project:edit']
	}
];

/**
 * Actions the Project Agent must refuse outright — writes/destructive or
 * out-of-domain. The platform tool-policy consults this before dispatch.
 */
export const projectAgentForbiddenActions: readonly ProjectForbiddenAction[] = [
	'delete_project',
	'modify_finance_record',
	'modify_employee_master_data',
	'change_permission',
	'bypass_validation'
];

export function findProjectCapabilityPolicy(
	capabilityId: string
): ProjectCapabilityPolicyEntry | undefined {
	return projectAgentAllowedCapabilities.find((entry) => entry.id === capabilityId);
}

export function isForbiddenProjectAction(action: string): action is ProjectForbiddenAction {
	return (projectAgentForbiddenActions as readonly string[]).includes(action);
}
