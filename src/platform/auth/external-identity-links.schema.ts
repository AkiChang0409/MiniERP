import { sql } from 'drizzle-orm';
import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { timeFields } from '$platform/modules/schema-helpers';
import { users } from './users.schema';

/**
 * Binds an external channel identity (e.g. a Lark `open_id`) to a MiniERP login
 * account (`users`). Used by inbound integrations (Lark webhook) to resolve
 * "who is this" into a real MiniERP user, whose roles then drive tool-policy.
 *
 * Exactly one ACTIVE binding per (provider, external_user_id) is enforced by a
 * partial unique index scoped to `deleted_at IS NULL` — re-binding the same
 * external identity to a different user requires soft-deleting (or repointing)
 * the existing row. A single MiniERP user may have several external identities.
 */
export const externalIdentityLinks = sqliteTable(
	'external_identity_links',
	{
		id: text('id').primaryKey(),
		/** Channel provider, e.g. 'lark'. */
		provider: text('provider').notNull(),
		/** Provider-side user id (Lark `open_id`). */
		externalUserId: text('external_user_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		status: text('status', { enum: ['active', 'disabled'] })
			.notNull()
			.default('active'),
		...timeFields
	},
	(t) => [
		uniqueIndex('external_identity_links_provider_external_active_uidx')
			.on(t.provider, t.externalUserId)
			.where(sql`${t.deletedAt} IS NULL`)
	]
);
