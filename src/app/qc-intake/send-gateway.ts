/**
 * QC intake — send gateway (P1).
 *
 * When a PM sends a blank QC checklist to a supplier, we capture the
 * project/supplier association *at send time* by encoding it into a signed
 * token (see `./token`). No jobs table: the identity rides in the upload URL and
 * the email subject.
 *
 * This service is deliberately Bitable-free — it only signs a token, composes
 * the subject, and emails the supplier (attachment + upload button + a
 * reply-to pointed at the monitored inbox for the email fallback channel).
 *
 * Return channels the supplier can use afterwards:
 *   A (primary): click the upload button → /qc/submit/<token> (deterministic).
 *   B (fallback): reply to the email → subject `[QC][project][supplier]` +
 *                 thread headers let the inbound matcher recover the ids.
 */

import { signQcToken } from './token';

export interface QcSendInput {
	projectId: string;
	supplierId: string;
	/** Chosen Category / File Type single-select labels (optional); written to Doc Hub on receipt. */
	category?: string;
	fileType?: string;
	/** Supplier recipient address (prefilled from the supplier record on the page). */
	recipientEmail: string;
	/** The blank checklist to attach. */
	file: { fileName: string; mimeType: string; bytes: Uint8Array };
	/** Public base URL for the upload link; defaults to env.BETTER_AUTH_URL. */
	appBaseUrl?: string;
}

export interface QcSendResult {
	token: string;
	subject: string;
	uploadUrl: string;
	emailSent: boolean;
}

/** Base64 (standard) for a Resend attachment; chunked to avoid call-stack limits. */
function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

export async function startQcSend(env: Env, input: QcSendInput): Promise<QcSendResult> {
	const token = await signQcToken(env, {
		projectId: input.projectId,
		supplierId: input.supplierId,
		category: input.category,
		fileType: input.fileType
	});
	const base = (input.appBaseUrl ?? env.BETTER_AUTH_URL ?? '').replace(/\/+$/, '');
	const uploadUrl = `${base}/qc/submit/${token}`;
	const subject = `[QC][${input.projectId}][${input.supplierId}]`;

	const text =
		`A QC checklist is attached for your inspection.\n\n` +
		`When done, upload the filled file here (recommended):\n${uploadUrl}\n\n` +
		`Or simply reply to this email with the filled file attached (keep the subject line).\n`;
	const html =
		`<p>A QC checklist is attached for your inspection.</p>` +
		`<p><a href="${uploadUrl}" style="display:inline-block;padding:10px 18px;background:#3370ff;` +
		`color:#fff;border-radius:6px;text-decoration:none">📤 Upload the filled checklist</a></p>` +
		`<p style="color:#646a73;font-size:13px">Or reply to this email with the filled file attached ` +
		`(please keep the subject line unchanged).</p>`;

	const emailSent = await sendQcEmail(env, {
		to: input.recipientEmail,
		subject,
		text,
		html,
		attachment: input.file
	});

	return { token, subject, uploadUrl, emailSent };
}

interface QcEmailMsg {
	to: string;
	subject: string;
	text: string;
	html: string;
	attachment: { fileName: string; mimeType: string; bytes: Uint8Array };
}

/**
 * Send via Resend with an attachment + reply-to. Mirrors the credential/logging
 * behaviour of `platform/auth/email.ts` but adds attachment + reply_to (which
 * that helper does not support). Returns whether the send was dispatched.
 */
async function sendQcEmail(env: Env, msg: QcEmailMsg): Promise<boolean> {
	const key = env.RESEND_API_KEY;
	const from = env.EMAIL_FROM;
	if (!key || !from) {
		console.warn('[qc] email not configured (RESEND_API_KEY / EMAIL_FROM). Upload link:', msg.subject);
		return false;
	}
	// Replies land in the monitored inbox (fallback channel B); defaults to `from`.
	const replyTo = env.QC_INBOX_EMAIL ?? from;

	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			from,
			to: [msg.to],
			reply_to: replyTo,
			subject: msg.subject,
			text: msg.text,
			html: msg.html,
			attachments: [{ filename: msg.attachment.fileName, content: bytesToBase64(msg.attachment.bytes) }]
		})
	});

	if (!res.ok) {
		console.error('[qc] Resend HTTP', res.status, await res.text());
		return false;
	}
	return true;
}
