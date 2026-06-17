/**
 * Pushes a Lark (Feishu) review card to the document's uploader when an artifact
 * reaches `ready_for_review`. Best-effort: any failure (no Lark creds, no active
 * binding, send error) is swallowed so the intake pipeline is never affected.
 *
 * Scope: **App uploads only** — sends the read-only Confirm/Reject card. Lark-
 * originated intakes (`uploadedFrom === 'lark'`) are handled by the app-layer
 * `sendLarkEditableReviewCard` (called from the composition root after
 * processDocument), which can pull the full category field set from finance to
 * build an editable card. This notifier stays platform-only (no `$modules/*`).
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

		// Lark-originated intakes get an editable card from the app layer instead.
		if (artifact.sourceMetadata?.manualUpload?.uploadedFrom === 'lark') return;

		const uploaderId = artifact.sourceMetadata?.manualUpload?.uploadedBy;
		if (!uploaderId) return; // e.g. email/drive ingest — no MiniERP uploader to notify.

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
			fields: (artifact.suggestedFields?.fields ?? {}) as Record<string, unknown>,
			confidence: artifact.suggestedFields?.confidence,
			appBaseUrl: env.BETTER_AUTH_URL ?? ''
		});

		await sendInteractiveCard(env, openId, 'open_id', card);
		console.log(`[lark] readonly review card sent for doc ${artifact.id}`);
	} catch (err) {
		console.error('[lark] review card notify failed (non-fatal):', err);
	}
}
