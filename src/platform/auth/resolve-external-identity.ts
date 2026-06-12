import type { DBClient } from '$infrastructure/db';
import { type AuthRole, parseRoles } from './config';
import { UserRepository } from './user-repository';
import { ExternalIdentityLinkRepository } from './external-identity-link-repository';

export interface ResolvedExternalUser {
	id: string;
	email: string;
	roles: AuthRole[];
}

/**
 * Resolve an external channel identity (e.g. Lark `open_id`) to the bound
 * MiniERP user, or null when unbound. This is the ONLY sanctioned way for an
 * inbound integration to learn "who is acting" — the userId/roles must never be
 * taken from the channel payload itself.
 */
export async function resolveUserByExternalIdentity(
	db: DBClient,
	provider: string,
	externalUserId: string
): Promise<ResolvedExternalUser | null> {
	const link = await new ExternalIdentityLinkRepository(db).findActiveByExternal(
		provider,
		externalUserId
	);
	if (!link) return null;

	const user = await new UserRepository(db).findById(link.userId);
	if (!user) return null;

	return { id: user.id, email: user.email, roles: parseRoles(user.role) };
}
