/**
 * Pushes a Lark (Feishu) review card to the document's uploader when an artifact
 * reaches `ready_for_review`. Best-effort: any failure (no Lark creds, no active
 * binding, send error) is swallowed so the intake pipeline is never affected.
 *
 * Boundary note: imports platform only (`$platform/*`) — no `$modules/*` — so it
 * stays a legal document-intake → platform dependency. Whether a category can be
 * confirmed from the card (vs requires a project) is decided later in the
 * card-callback route, not here.
 */
import type { DBClient } from '$infrastructure/db';
import { ExternalIdentityLinkRepository } from '$platform/auth/external-identity-link-repository';
import { sendInteractiveCard } from '$platform/integrations/lark/client';
import { buildIntakeReviewCard } from '$platform/integrations/lark/cards/intake-review-card';
import type { DocumentArtifact } from '../schemas/document-artifact.schema';

const LARK_PROVIDER = 'lark';

export async function notifyLarkReviewCard(
	ctx: { db: DBClient; env: Env },
	artifact: DocumentArtifact
): Promise<void> {
	try {
		const env = ctx.env;
		// Without app credentials we can't mint a token / send anything.
		if (!env.LARK_APP_ID || !env.LARK_APP_SECRET) return;

		const uploaderId = artifact.sourceMetadata?.manualUpload?.uploadedBy;
		if (!uploaderId) return; // e.g. email/drive ingest — no MiniERP uploader to notify.

		// Lark-originated intakes drive their own conversational card flow (project
		// picker → editable review card in the card-callback), so the auto read-only
		// card would be a duplicate. Skip it.
		if (artifact.sourceMetadata?.manualUpload?.uploadedFrom === 'lark') return;

		const openId = await new ExternalIdentityLinkRepository(ctx.db).findActiveExternalIdByUser(
			LARK_PROVIDER,
			uploaderId
		);
		if (!openId) {
			console.log(`[lark] no active Lark binding for uploader ${uploaderId}; skip review card`);
			return;
		}

		const card = buildIntakeReviewCard({
			documentId: artifact.id,
			fileName: artifact.originalFile.fileName,
			categoryId: artifact.suggestedCategoryId ?? null,
			documentType: artifact.documentType,
			fields: artifact.suggestedFields?.fields ?? {},
			confidence: artifact.suggestedFields?.confidence,
			appBaseUrl: env.BETTER_AUTH_URL ?? ''
		});

		await sendInteractiveCard(env, openId, 'open_id', card);
		console.log(`[lark] review card sent to ${openId} for doc ${artifact.id}`);
	} catch (err) {
		console.error('[lark] review card notify failed (non-fatal):', err);
	}
}
