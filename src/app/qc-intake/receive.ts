/**
 * QC intake — receive & persist (P2).
 *
 * Called from the supplier upload page (`/qc/submit/[token]`). Verifies the
 * signed token to recover the project/supplier association (no lookup table),
 * uploads the file to Lark, and creates a Doc Hub record with the file attached
 * and the relations filled, in status "pending review" for the PM to confirm.
 *
 * QC does NOT parse the file — the attachment is stored as-is.
 */

import { verifyQcToken } from './token';
import {
	bitableCreateRecord,
	bitableGetRecord,
	bitableListFieldNames,
	bitableListFields,
	bitableUploadMedia,
	type BitableFields
} from '$platform/integrations/lark/bitable';
import { sendInteractiveCard } from '$platform/integrations/lark/client';
import { buildQcReviewCard } from '$platform/integrations/lark/cards/qc-review-card';

// ⚠️ These must match the single-select option labels in your Doc Hub table.
// Adjust if your options use different text (e.g. Chinese labels).
const DOC_STATUS_PENDING = 'Pending Review';
const SOURCE_UPLOAD_LINK = 'Link'; // Source options: Link / Email / Manual
const MATCH_CONFIDENCE_HIGH = 'High'; // upload token is deterministic → high confidence

export interface QcReceiveResult {
	recordId: string;
	projectId: string;
	supplierId: string;
}

export type QcReceiveOutcome =
	| { ok: true; result: QcReceiveResult }
	| { ok: false; reason: 'invalid_token' | 'not_configured' | 'error'; message?: string };

export async function receiveQcUpload(
	env: Env,
	args: { token: string; file: { fileName: string; mimeType: string; bytes: Uint8Array } }
): Promise<QcReceiveOutcome> {
	const ids = await verifyQcToken(env, args.token);
	if (!ids) return { ok: false, reason: 'invalid_token' };

	const appToken = env.LARK_DOCHUB_APP_TOKEN;
	const tableId = env.LARK_DOCHUB_TABLE_ID;
	if (!appToken || !tableId) {
		return { ok: false, reason: 'not_configured', message: 'Doc Hub Base is not configured' };
	}

	try {
		const fileToken = await bitableUploadMedia(env, {
			appToken,
			fileName: args.file.fileName,
			mimeType: args.file.mimeType,
			bytes: args.file.bytes
		});

		// Desired payload. Link fields take an array of record_ids; attachment
		// takes [{ file_token }]; single-selects take the option label string.
		const desired: BitableFields = {
			'Doc Title': args.file.fileName,
			'Attachment File': [{ file_token: fileToken }],
			Projects: [ids.projectId],
			'Customer/Supplier': [ids.supplierId],
			'Doc Status': DOC_STATUS_PENDING,
			Source: SOURCE_UPLOAD_LINK,
			'Match Confidence': MATCH_CONFIDENCE_HIGH
		};

		// Only write fields that actually exist in the table — guards against a
		// name mismatch failing the whole insert (Lark code 1254045). Skipped
		// fields are logged so the mismatch is easy to spot in `wrangler tail`.
		const existing = new Set(await bitableListFieldNames(env, { appToken, tableId }).catch(() => []));
		const fields: BitableFields = {};
		const skipped: string[] = [];
		for (const [key, value] of Object.entries(desired)) {
			if (existing.size === 0 || existing.has(key)) fields[key] = value;
			else skipped.push(key);
		}
		if (skipped.length) {
			console.warn(`[qc] Doc Hub fields not found, skipped: ${skipped.join(', ')}`);
		}

		const record = await bitableCreateRecord(env, { appToken, tableId, fields });

		// Best-effort: notify the project PM to review (never fails the upload).
		await notifyPmForReview(env, {
			recordId: record.record_id,
			projectId: ids.projectId,
			supplierId: ids.supplierId,
			fileName: args.file.fileName
		});

		return {
			ok: true,
			result: { recordId: record.record_id, projectId: ids.projectId, supplierId: ids.supplierId }
		};
	} catch (err) {
		return { ok: false, reason: 'error', message: (err as Error).message };
	}
}

/** Flatten a Bitable cell value (text fields come back as strings or arrays). */
function cellText(v: unknown): string {
	if (v == null) return '';
	if (typeof v === 'string') return v;
	if (Array.isArray(v)) return v.map(cellText).join('');
	if (typeof v === 'object') {
		const o = v as Record<string, unknown>;
		if (typeof o.text === 'string') return o.text;
		if (typeof o.name === 'string') return o.name;
		return '';
	}
	return String(v);
}

/** First Lark user id from a person-field value (`[{ id, name, … }]`). */
function personOpenId(v: unknown): string | null {
	if (Array.isArray(v) && v.length > 0) {
		const p = v[0] as Record<string, unknown>;
		if (p && typeof p.id === 'string') return p.id;
	}
	return null;
}

/**
 * Read the project's PM (person field) and DM them a QC review card. Best-effort:
 * any failure is swallowed so a successful upload is never rolled back.
 */
async function notifyPmForReview(
	env: Env,
	args: { recordId: string; projectId: string; supplierId: string; fileName: string }
): Promise<void> {
	try {
		const appToken = env.LARK_DOCHUB_APP_TOKEN;
		const projectTable = env.LARK_PROJECT_TABLE_ID;
		if (!appToken || !projectTable) return;

		const project = await bitableGetRecord(env, {
			appToken,
			tableId: projectTable,
			recordId: args.projectId
		});
		console.log('[qc] PM field raw:', JSON.stringify(project.fields['PM'] ?? null));
		const openId = personOpenId(project.fields['PM']);
		if (!openId) {
			console.log('[qc] project has no PM person → skip review card');
			return;
		}
		const projectName = cellText(project.fields['Project']);

		let supplierName = '';
		const supplierTable = env.LARK_SUPPLIER_TABLE_ID;
		if (supplierTable) {
			const supplier = await bitableGetRecord(env, {
				appToken,
				tableId: supplierTable,
				recordId: args.supplierId
			}).catch(() => null);
			if (supplier) supplierName = cellText(supplier.fields['Name']);
		}

		// Pull the Doc Hub Category / File Type option labels so the PM can pick
		// them right on the review card (single-selects defined in the table).
		let categoryOptions: string[] = [];
		let fileTypeOptions: string[] = [];
		const dochubTable = env.LARK_DOCHUB_TABLE_ID;
		if (dochubTable) {
			const defs = await bitableListFields(env, { appToken, tableId: dochubTable }).catch(() => []);
			categoryOptions = defs.find((f) => f.name === 'Category')?.options ?? [];
			fileTypeOptions = defs.find((f) => f.name === 'File Type')?.options ?? [];
		}

		await sendInteractiveCard(
			env,
			openId,
			'open_id',
			buildQcReviewCard({
				recordId: args.recordId,
				projectName,
				supplierName,
				fileName: args.fileName,
				source: 'Link',
				confidence: 'High',
				categoryOptions,
				fileTypeOptions
			})
		);
		console.log('[qc] review card sent to', openId);
	} catch (err) {
		console.error('[qc] PM review card notify failed (non-fatal):', err);
	}
}
