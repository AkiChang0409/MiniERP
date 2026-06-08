import { and, eq, isNull } from 'drizzle-orm';
import type { DBClient } from '$infrastructure/db';
import { BaseRepository } from '$platform/modules/base-repository';
import { userPersonLinks } from './user-person-links.schema';

/**
 * Owns the user ↔ HR person binding table. A link is considered *active* only
 * when `status = 'active'` AND `deleted_at IS NULL`; everything here filters on
 * that definition. Unbinding is a soft-delete (`softDelete`), which — thanks to
 * the partial unique indexes — frees both user and person for a fresh bind.
 */
export class UserPersonLinkRepository extends BaseRepository<typeof userPersonLinks> {
	constructor(db: DBClient) {
		super(db, userPersonLinks);
	}

	async findActiveByUserId(userId: string) {
		const rows = await this.db
			.select()
			.from(userPersonLinks)
			.where(
				and(
					eq(userPersonLinks.userId, userId),
					eq(userPersonLinks.status, 'active'),
					isNull(userPersonLinks.deletedAt)
				)
			)
			.limit(1);
		return rows[0] ?? null;
	}

	async findActiveByPersonId(personId: string) {
		const rows = await this.db
			.select()
			.from(userPersonLinks)
			.where(
				and(
					eq(userPersonLinks.personId, personId),
					eq(userPersonLinks.status, 'active'),
					isNull(userPersonLinks.deletedAt)
				)
			)
			.limit(1);
		return rows[0] ?? null;
	}

	/** personIds with an active link — used to exclude already-bound employees. */
	async listActiveLinkedPersonIds(): Promise<string[]> {
		const rows = await this.db
			.select({ personId: userPersonLinks.personId })
			.from(userPersonLinks)
			.where(and(eq(userPersonLinks.status, 'active'), isNull(userPersonLinks.deletedAt)));
		return rows.map((r) => r.personId);
	}

	/**
	 * Create an active link. Guards against an existing active link on either
	 * side; the partial unique indexes are the final backstop against races.
	 */
	async linkUserToPerson(userId: string, personId: string) {
		const [existingUser, existingPerson] = await Promise.all([
			this.findActiveByUserId(userId),
			this.findActiveByPersonId(personId)
		]);
		if (existingUser) throw new Error('User is already linked to a person');
		if (existingPerson) throw new Error('Person is already linked to a user');
		return this.create({ userId, personId, status: 'active' });
	}

	/** Temporarily disable a live link without unbinding it. */
	async disable(linkId: string) {
		await this.update(linkId, { status: 'disabled' });
	}
}
