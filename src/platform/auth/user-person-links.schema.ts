import { sql } from 'drizzle-orm';
import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { timeFields } from '$platform/modules/schema-helpers';
import { users } from './users.schema';

/**
 * Binds a login account (better-auth `users`) to an HR identity (`persons`).
 *
 * Identity (this link) and permission (`users.role`) are orthogonal: holding an
 * `employee` role does not imply a link, and a link does not constrain roles.
 *
 * MVP is strictly one-to-one and enforced by *partial* unique indexes scoped to
 * `deleted_at IS NULL`, so unbinding (soft-delete) frees both sides for a fresh
 * bind — supporting frequent re-binding during development. `status` toggles a
 * live link on/off without unbinding it. `resolveCurrentPersonId` only honours
 * rows that are both `status = 'active'` and not soft-deleted.
 */
export const userPersonLinks = sqliteTable(
	'user_person_links',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		// Logical FK to persons.id — enforced by the migration. No TS-level
		// reference here: platform must not import from the HR module.
		personId: text('person_id').notNull(),
		status: text('status', { enum: ['active', 'disabled'] })
			.notNull()
			.default('active'),
		...timeFields
	},
	(t) => [
		uniqueIndex('user_person_links_user_active_uidx')
			.on(t.userId)
			.where(sql`${t.deletedAt} IS NULL`),
		uniqueIndex('user_person_links_person_active_uidx')
			.on(t.personId)
			.where(sql`${t.deletedAt} IS NULL`)
	]
);
