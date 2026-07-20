/**
 * Doc Hub attachment → text bridge for the MCP endpoint.
 *
 * Fetches a Doc Hub record's attachment(s) from Bitable and runs the platform
 * text-extraction pass (`extractTextFromBytesRaw`) on each — the same
 * extraction used everywhere else in MiniERP, just fed by bytes downloaded
 * straight from Lark Drive instead of R2.
 */
import { larkDocHubTarget, bitableGetRecord, bitableDownloadMedia } from './bitable';
import type { BitableFields } from './bitable';
import { extractTextFromBytesRaw } from '$platform/ai/text-extraction';

interface RawAttachment {
	file_token?: string;
	name?: string;
	type?: string;
}

export interface DocHubAttachmentFile {
	fileToken: string;
	name: string;
	mimeType: string;
}

/** Duck-type a Bitable attachment field value: an array of `{file_token, name, type}`. */
function isAttachmentArray(value: unknown): value is RawAttachment[] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.every((v) => v && typeof v === 'object' && typeof (v as RawAttachment).file_token === 'string')
	);
}

/**
 * Every attachment file across every attachment-typed field on a record. Field
 * name is intentionally not assumed — Doc Hub's attachment column may be
 * renamed without breaking this.
 */
export function collectAttachmentFiles(fields: BitableFields): DocHubAttachmentFile[] {
	const files: DocHubAttachmentFile[] = [];
	for (const value of Object.values(fields)) {
		if (!isAttachmentArray(value)) continue;
		for (const f of value) {
			if (!f.file_token) continue;
			files.push({
				fileToken: f.file_token,
				name: f.name ?? f.file_token,
				mimeType: f.type ?? 'application/octet-stream'
			});
		}
	}
	return files;
}

export interface DocHubFileTextResult {
	name: string;
	status: 'success' | 'partial' | 'failed';
	text: string;
	error?: string;
}

export interface DocHubTextResult {
	files: DocHubFileTextResult[];
	/** All files' text concatenated (multi-file records get `--- name ---` headers). */
	text: string;
}

export interface DocHubRecordTextResult extends DocHubTextResult {
	recordId: string;
}

/**
 * Download + OCR/extract text from every attachment on an already-fetched
 * record's `fields`. Split from `extractDocHubRecordText` so callers that
 * already hold the record (e.g. the summary pipeline, which also needs the
 * status field) don't fetch it twice.
 */
export async function extractAttachmentsText(
	env: Env,
	fields: BitableFields
): Promise<DocHubTextResult> {
	const attachments = collectAttachmentFiles(fields);
	if (attachments.length === 0) {
		return { files: [], text: '' };
	}

	const files: DocHubFileTextResult[] = [];
	for (const att of attachments) {
		try {
			const { bytes, mimeType } = await bitableDownloadMedia(env, att.fileToken);
			const result = await extractTextFromBytesRaw(bytes, mimeType || att.mimeType, att.name, env);
			files.push({
				name: att.name,
				status: result.status,
				text: result.text ?? '',
				error: result.error?.message
			});
		} catch (err) {
			files.push({
				name: att.name,
				status: 'failed',
				text: '',
				error: err instanceof Error ? err.message : String(err)
			});
		}
	}

	const withText = files.filter((f) => f.text.trim().length > 0);
	const text = withText
		.map((f) => (files.length > 1 ? `--- ${f.name} ---\n${f.text}` : f.text))
		.join('\n\n');

	return { files, text };
}

/** Fetch a Doc Hub record's attachment(s) and OCR/extract text from each. */
export async function extractDocHubRecordText(env: Env, recordId: string): Promise<DocHubRecordTextResult> {
	const { appToken, tableId } = larkDocHubTarget(env);
	const record = await bitableGetRecord(env, { appToken, tableId, recordId });
	const result = await extractAttachmentsText(env, record.fields);
	return { recordId, ...result };
}
