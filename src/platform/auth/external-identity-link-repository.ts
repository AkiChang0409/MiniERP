import { and, eq, isNull } from 'drizzle-orm';
import type { DBClient } from '$infrastructure/db';
import { BaseRepository } from '$platform/modules/base-repository';
import { externalIdentityLinks } from './external-identity-links.schema';

/**
 * Owns the external-identity ↔ MiniERP user binding table. A link is *active*
 * only when `status = 'active'` AND `deleted_at IS NULL`.
 */
export class ExternalIdentityLinkRepository extends BaseRepository<typeof externalIdentityLinks> {
	constructor(db: DBClient) {
		super(db, externalIdentityLinks);
	}

	async findActiveByExternal(provider: string, externalUserId: string) {
		const rows = await this.db
			.select()
			.from(externalIdentityLinks)
			.where(
				and(
					eq(externalIdentityLinks.provider, provider),
					eq(externalIdentityLinks.externalUserId, externalUserId),
					eq(externalIdentityLinks.status, 'active'),
					isNull(externalIdentityLinks.deletedAt)
				)
			)
			.limit(1);
		return rows[0] ?? null;
	}

	/**
	 * Reverse of {@link findActiveByExternal}: given a MiniERP `userId`, return the
	 * active external id (e.g. Lark `open_id`) for the provider, or null when the
	 * user has no active binding. Used by outbound integrations (e.g. pushing a
	 * Lark review card to the uploader). If a user somehow has multiple active
	 * links, the first row is returned — the partial unique index only guarantees
	 * uniqueness per (provider, external_user_id), not per (provider, user_id).
	 */
	async findActiveExternalIdByUser(provider: string, userId: string): Promise<string | null> {
		const rows = await this.db
			.select({ externalUserId: externalIdentityLinks.externalUserId })
			.from(externalIdentityLinks)
			.where(
				and(
					eq(externalIdentityLinks.provider, provider),
					eq(externalIdentityLinks.userId, userId),
					eq(externalIdentityLinks.status, 'active'),
					isNull(externalIdentityLinks.deletedAt)
				)
			)
			.limit(1);
		return rows[0]?.externalUserId ?? null;
	}
}
