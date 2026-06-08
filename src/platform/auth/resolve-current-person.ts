import type { DBClient } from '$infrastructure/db';
import { UserPersonLinkRepository } from './user-person-link-repository';

/**
 * Resolve the HR person bound to a login account, or null when unbound.
 *
 * This is the ONLY sanctioned way for `/employee/*` to learn the current
 * employee's identity — the personId must never be supplied by the client.
 * Returns null for unauthenticated or unbound users; callers should render an
 * "account not linked to an employee profile" state rather than erroring.
 */
export async function resolveCurrentPersonId(
	db: DBClient,
	userId: string | null | undefined
): Promise<string | null> {
	if (!userId) return null;
	const link = await new UserPersonLinkRepository(db).findActiveByUserId(userId);
	return link?.personId ?? null;
}
