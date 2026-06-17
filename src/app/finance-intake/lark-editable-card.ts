/**
 * Sends the Lark editable review card for a Lark-originated intake once it
 * reaches `ready_for_review`. Unlike the document-intake notifier (platform-only,
 * sends the App read-only card), this lives in the app layer so it can pull the
 * category's FULL field set from finance (`findCategoryById`) — the card then
 * shows an input for every field, not just the ones the AI extracted, so the
 * user can fill the blanks.
 *
 * Called by the composition roots that run the pipeline for Lark docs: the queue
 * consumer (prod) and `processIntakeDocument` (dev inline). No-op for non-Lark
 * artifacts. Best-effort — never throws into the pipeline.
 */
import type { DBClient } from '$infrastructure/db';
import { ExternalIdentityLinkRepository } from '$platform/auth/external-identity-link-repository';
import { sendInteractiveCard } from '$platform/integrations/lark/client';
import {
	buildEditableReviewCard,
	buildNoticeCard
} from '$platform/integrations/lark/cards/finance-intake-cards';
import { findCategoryById } from '$modules/finance';
import type { DocumentArtifact } from '$modules/document-intake';

const LARK_PROVIDER = 'lark';

/** Returns true if it handled (sent or attempted) a Lark card; false if not applicable. */
export async function sendLarkEditableReviewCard(
	env: Env,
	db: DBClient,
	artifact: DocumentArtifact
): Promise<boolean> {
	if (artifact.sourceMetadata?.manualUpload?.uploadedFrom !== 'lark') return false;
	if (!env.LARK_APP_ID || !env.LARK_APP_SECRET) return false;

	const uploaderId = artifact.sourceMetadata?.manualUpload?.uploadedBy;
	if (!uploaderId) return false;

	try {
		const openId = await new ExternalIdentityLinkRepository(db).findActiveExternalIdByUser(
			LARK_PROVIDER,
			uploaderId
		);
		if (!openId) {
			console.log(`[lark] no active binding for uploader ${uploaderId}; skip editable card`);
			return false;
		}

		if (!artifact.suggestedCategoryId) {
			await sendInteractiveCard(
				env,
				openId,
				'open_id',
				buildNoticeCard('无法自动分类', '未能识别该单据类别，请在 App 中处理。', 'red')
			);
			return true;
		}

		// FULL field set for the category so the user can also fill un-extracted fields.
		const category = findCategoryById(artifact.suggestedCategoryId);
		const fieldKeys = category
			? [...new Set([...category.llmFields, ...category.userFields])]
			: undefined;

		const projectId = (await env.KV.get(`lark:fin-project:${artifact.id}`)) ?? undefined;

		const card = buildEditableReviewCard({
			documentId: artifact.id,
			categoryId: artifact.suggestedCategoryId,
			fileName: artifact.originalFile.fileName,
			documentType: artifact.documentType,
			fieldKeys,
			fields: (artifact.suggestedFields?.fields ?? {}) as Record<string, unknown>,
			confidence: artifact.suggestedFields?.confidence,
			projectId
		});
		await sendInteractiveCard(env, openId, 'open_id', card);
		console.log(`[lark] editable review card sent for doc ${artifact.id}`);
		return true;
	} catch (err) {
		console.error('[lark] editable card send failed (non-fatal):', err);
		return true;
	}
}
