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
}
