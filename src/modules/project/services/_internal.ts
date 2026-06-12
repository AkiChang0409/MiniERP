/**
 * Small cross-service helpers shared by the split project services
 * (access + lifecycle). Kept module-private — not part of the public surface.
 */

/** True when the actor's roles grant manager-level project authority. */
export function isManager(roles: readonly string[] | null | undefined): boolean {
	if (!roles) return false;
	return roles.some((r) => r === 'owner' || r === 'admin' || r === 'project_manager');
}
