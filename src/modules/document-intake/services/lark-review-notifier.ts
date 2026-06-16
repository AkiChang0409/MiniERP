/**
 * Pushes a Lark (Feishu) review card to the document's uploader when an artifact
 * reaches `ready_for_review`. Best-effort: any failure (no Lark creds, no active
 * binding, send error) is swallowed so the intake pipeline is never affected.
 *
 * Two shapes, by origin:
 *  - App upload (`uploadedFrom !== 'lark'`): a read-only Confirm/Reject card.
 *  - Lark menu flow (`uploadedFrom === 'lark'`): an EDITABLE form card, with the
 *    project the user already picked (read from KV `lark:fin-project:<id>`,
 *    written by the card-callback `pick_project` handler) embedded in Approve.
 *
 * Runs wherever `processDocument` reaches ready_for_review — inline (dev) AND the
 * queue worker (prod). The queue worker therefore needs LARK_APP_ID/SECRET set
 * (see deploy workflow). Boundary: imports `$platform/*` only — no `$modules/*`.
 */
import type { DBClient } from '$infrastructure/db';
import { ExternalIdentityLinkRepository } from '$platform/auth/external-identity-link-repository';
import { sendInteractiveCard } from '$platform/integrations/lark/client';
import { buildIntakeReviewCard } from '$platform/integrations/lark/cards/intake-review-card';
import {
	buildEditableReviewCard,
	buildNoticeCard
} from '$platform/integrations/lark/cards/finance-intake-cards';
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

		const openId = await new ExternalIdentityLinkRepository(ctx.db).findActiveExternalIdByUser(
			LARK_PROVIDER,
			uploaderId
		);
		if (!openId) {
			console.log(`[lark] no active Lark binding for uploader ${uploaderId}; skip review card`);
			return;
		}

		const fromLark = artifact.sourceMetadata?.manualUpload?.uploadedFrom === 'lark';
		const fileName = artifact.originalFile.fileName;
		const fields = (artifact.suggestedFields?.fields ?? {}) as Record<string, unknown>;
		const confidence = artifact.suggestedFields?.confidence;

		let card: Record<string, unknown>;
		if (fromLark) {
			if (!artifact.suggestedCategoryId) {
				card = buildNoticeCard('无法自动分类', '未能识别该单据类别，请在 App 中处理。', 'red');
			} else {
				const projectId =
					(await env.KV.get(`lark:fin-project:${artifact.id}`)) ?? undefined;
				card = buildEditableReviewCard({
					documentId: artifact.id,
					categoryId: artifact.suggestedCategoryId,
					fileName,
					documentType: artifact.documentType,
					fields,
					confidence,
					projectId
				});
			}
		} else {
			card = buildIntakeReviewCard({
				documentId: artifact.id,
				fileName,
				categoryId: artifact.suggestedCategoryId ?? null,
				documentType: artifact.documentType,
				fields,
				confidence,
				appBaseUrl: env.BETTER_AUTH_URL ?? ''
			});
		}

		await sendInteractiveCard(env, openId, 'open_id', card);
		console.log(`[lark] review card (${fromLark ? 'editable' : 'readonly'}) sent for doc ${artifact.id}`);
	} catch (err) {
		console.error('[lark] review card notify failed (non-fatal):', err);
	}
}
