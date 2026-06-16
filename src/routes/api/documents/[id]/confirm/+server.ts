import type { RequestHandler } from './$types';

import { fail, ok } from '$platform/http';
import { hashConfirmationPayload } from '$platform/workflow/payload-hash';
import { createModuleContext } from '$platform/modules';
import { getDb } from '../../../../../infrastructure/db';
import { financeAgentManifest } from '$modules/finance';
import { appendAgentAuditEntry } from '$platform/audit/audit-log';
import { confirmInbox } from '$app-layer/finance-intake/confirm-inbox';

/**
 * POST /api/documents/[id]/confirm
 *
 * Inbox-flow confirmation endpoint (Ship 2). User has reviewed the
 * `suggestedFields` (or edited them) on the artifact and clicks Confirm.
 *
 * This route is a thin transport wrapper: it authenticates the session user,
 * enforces the payload-hash tamper guard (UI state must match the submission),
 * then delegates the actual persistence to `confirmInbox()` — the shared
 * orchestrator that also backs the Lark card-callback Confirm action.
 *
 * Request body (JSON):
 *  - `payload.documentId` (required): must match :id
 *  - `payload.categoryId` (required): the category the user confirmed; pinned
 *  - `payload.fields` (required): final field values (potentially edited)
 *  - `payload.supplierId` / `poId` / `projectId` (optional): user-attached links
 *  - `payloadHash` (required): sha-256 of the canonical payload (tamper guard)
 */

interface ConfirmedPayload {
	documentId: string;
	categoryId: string;
	supplierId?: string | null;
	poId?: string | null;
	projectId?: string | null;
	fields: Record<string, unknown>;
}

interface ConfirmBody {
	payload: ConfirmedPayload;
	payloadHash: string;
}

export const POST: RequestHandler = async (event) => {
	if (!event.platform) return fail('Cloudflare platform bindings are required', 500);
	const user = event.locals.user;
	if (!user) return fail('Unauthorized', 401);

	const id = event.params.id;
	if (!id) return fail('Document id is required', 400);

	const body = (await event.request.json().catch(() => null)) as ConfirmBody | null;
	if (!body?.payload || !body?.payloadHash) {
		return fail('payload and payloadHash are required', 400);
	}
	if (body.payload.documentId !== id) {
		return fail('payload.documentId does not match URL :id', 400);
	}

	// Tamper guard: the submitted payload must match the hash the UI computed.
	const recomputedHash = await hashConfirmationPayload(body.payload);
	if (recomputedHash !== body.payloadHash) {
		const db = getDb(event.platform.env);
		await appendAgentAuditEntry(db, {
			agentId: financeAgentManifest.id,
			agentVersion: financeAgentManifest.version,
			userId: user.id,
			userEmail: user.email,
			tenantId: 'default',
			workflowId: id,
			workflowStep: 'inbox_confirm',
			toolId: 'finance.create-expense-record',
			riskLevel: 'R4',
			permissionResult: 'allowed',
			confirmationRequired: true,
			confirmationRef: body.payloadHash,
			finalAction: 'inbox.confirmation_failed',
			status: 'failed',
			errorCode: 'payload_hash_mismatch'
		});
		return fail('Payload hash mismatch — UI state and submission do not agree.', 400);
	}

	const ctx = await createModuleContext(event);
	const result = await confirmInbox(ctx, {
		documentId: id,
		categoryId: body.payload.categoryId,
		fields: body.payload.fields,
		projectId: body.payload.projectId ?? null,
		supplierId: body.payload.supplierId ?? null,
		poId: body.payload.poId ?? null,
		actor: { id: user.id, email: user.email }
	});

	if (!result.ok) {
		return fail(result.error, result.status, result.issues ? { issues: result.issues } : undefined);
	}

	return ok({
		entityId: result.entityId,
		auditRef: result.auditRef,
		entityRoute: result.entityRoute,
		categoryId: result.categoryId
	});
};
