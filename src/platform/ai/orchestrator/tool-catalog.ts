/**
 * Build the governed tool catalog for a user: every enabled capability whose
 * required permissions the user's roles satisfy, across ALL domains. Reads and
 * writes are both included (writes carry `sideEffect:'write'` +
 * `requiresConfirmation`); the unified agent loop decides execute-vs-stage.
 * Empty `requiredUserPermissions` = available to any authenticated user.
 *
 * This replaces the old per-agent scoping (`listToolSpecs({agentId})`) so the
 * loop can reason and act across domains — while tool-policy still gates every
 * actual call.
 */
import type { AuthRole } from '../../auth/config';
import { listToolSpecs, type ToolSpec } from '../capability-registry';
import { rolesHavePermission } from '../tool-policy';

export function buildAgentToolCatalog(roles: AuthRole[] | null | undefined): ToolSpec[] {
	return listToolSpecs().filter((spec) =>
		spec.requiredUserPermissions.every((permission) => rolesHavePermission(roles, permission))
	);
}
