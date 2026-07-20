/**
 * Doc Hub auto-summary pipeline (Lark automation → MiniERP external service).
 *
 * Lark's automation ("新增记录时") can't parse files, so it fires an HTTP
 * request at MiniERP with the new record's id. This orchestrates the full
 * server-side pipeline:
 *   1. read the record
 *   2. collect the attachment file_token(s)
 *   3. download the file(s) from Lark Drive
 *   4. OCR / extract the document text
 *   5. LLM-summarize the text
 *   6. write the summary back into the record ("Doc Content") and flip
 *      "Processing Status" to Completed (or Failed on error).
 *
 * Target field names + the Completed/Failed option labels are resolved against
 * the live table schema (`bitableListFields`) with env overrides, so a rename
 * in Bitable doesn't silently drop the write.
 */
import {
	larkDocHubTarget,
	bitableGetRecord,
	bitableUpdateRecord,
	bitableListFields,
	bitableTableRevision,
	type BitableFieldDef
} from './bitable';
import { extractAttachmentsText } from './doc-hub-attachment-text';
import { bitableSelectLabel } from './bitable-field-codec';
import { summarizeDocumentText } from '$platform/ai/summarize';

function readEnv(env: Env, key: string): string {
	const v = (env as unknown as Record<string, unknown>)[key];
	return typeof v === 'string' ? v.trim() : '';
}

/** Default field names / option labels — overridable via env when the Base uses different labels. */
const DEFAULTS = {
	contentField: 'Doc Content',
	statusField: 'Processing Status',
	doneValue: 'Completed',
	failedValue: 'Failed'
} as const;

/** Alias candidates used to locate a field by name when the exact default isn't present. */
const CONTENT_FIELD_ALIASES = ['Doc Content', '文件正文', '正文', 'Content', 'Summary', '总结', '摘要'];
const STATUS_FIELD_ALIASES = ['Processing Status', '处理状态', '状态', 'Status'];
const DONE_VALUE_ALIASES = ['Completed', 'Complete', 'Done', 'Success', '已完成', '完成'];
const FAILED_VALUE_ALIASES = ['Failed', 'Error', 'Failure', '失败', '错误'];

/** Find a field by an env override first, then a case-insensitive alias match. */
function resolveFieldName(fields: BitableFieldDef[], override: string, aliases: string[]): string | undefined {
	const names = fields.map((f) => f.name);
	if (override && names.includes(override)) return override;
	const lower = new Map(names.map((n) => [n.toLowerCase(), n]));
	for (const alias of [override, ...aliases]) {
		const hit = alias && lower.get(alias.toLowerCase());
		if (hit) return hit;
	}
	return undefined;
}

/** Pick the option label on a single-select field that best matches the desired value/aliases. */
function resolveSelectOption(
	field: BitableFieldDef | undefined,
	override: string,
	aliases: string[]
): string | undefined {
	const candidates = [override, ...aliases].filter(Boolean);
	if (!field || field.options.length === 0) {
		// Field has no enumerated options (free text) — write the desired label as-is.
		return candidates[0];
	}
	const lower = new Map(field.options.map((o) => [o.toLowerCase(), o]));
	for (const c of candidates) {
		const hit = lower.get(c.toLowerCase());
		if (hit) return hit;
	}
	return undefined;
}

/** Per-attachment extraction diagnostics surfaced on the failure path. */
export interface DocHubFileDiagnostic {
	name: string;
	status: string;
	chars: number;
	error?: string;
}

export type DocHubSummaryResult =
	| { ok: true; recordId: string; summary: string; provider: string; skipped?: boolean }
	| { ok: false; recordId: string; reason: string; files?: DocHubFileDiagnostic[] };

interface ResolvedSchema {
	appToken: string;
	tableId: string;
	fields: BitableFieldDef[];
	contentField?: string;
	statusFieldDef?: BitableFieldDef;
	statusField?: string;
	doneValue?: string;
	failedValue?: string;
}

async function resolveSchema(env: Env): Promise<ResolvedSchema> {
	const { appToken, tableId } = larkDocHubTarget(env);
	const fields = await bitableListFields(env, { appToken, tableId });
	const contentField = resolveFieldName(
		fields,
		readEnv(env, 'LARK_DOCHUB_CONTENT_FIELD') || DEFAULTS.contentField,
		CONTENT_FIELD_ALIASES
	);
	const statusField = resolveFieldName(
		fields,
		readEnv(env, 'LARK_DOCHUB_STATUS_FIELD') || DEFAULTS.statusField,
		STATUS_FIELD_ALIASES
	);
	const statusFieldDef = fields.find((f) => f.name === statusField);
	const doneValue = resolveSelectOption(
		statusFieldDef,
		readEnv(env, 'LARK_DOCHUB_STATUS_DONE') || DEFAULTS.doneValue,
		DONE_VALUE_ALIASES
	);
	const failedValue = resolveSelectOption(
		statusFieldDef,
		readEnv(env, 'LARK_DOCHUB_STATUS_FAILED') || DEFAULTS.failedValue,
		FAILED_VALUE_ALIASES
	);
	return { appToken, tableId, fields, contentField, statusField, statusFieldDef, doneValue, failedValue };
}

/** Best-effort status write — never throws (used on the failure path). */
async function trySetStatus(
	env: Env,
	schema: ResolvedSchema,
	recordId: string,
	value: string | undefined
): Promise<void> {
	if (!schema.statusField || !value) return;
	try {
		await bitableUpdateRecord(env, {
			appToken: schema.appToken,
			tableId: schema.tableId,
			recordId,
			fields: { [schema.statusField]: value }
		});
	} catch (err) {
		console.error('[doc-hub-summary] failed to set status:', err);
	}
}

/**
 * Run the full summary pipeline for one Doc Hub record. Resilient by design:
 * failures flip the record to the Failed status (best-effort) and return a
 * reason instead of throwing, so the caller can log without the record looking
 * stuck "in progress".
 */
export async function summarizeDocHubRecord(env: Env, recordId: string): Promise<DocHubSummaryResult> {
	const schema = await resolveSchema(env);

	const record = await bitableGetRecord(env, {
		appToken: schema.appToken,
		tableId: schema.tableId,
		recordId
	});

	// Idempotency: if already Completed, don't re-run (Lark may re-fire the trigger).
	if (schema.statusField && schema.doneValue) {
		const current = bitableSelectLabel(record.fields[schema.statusField]);
		if (current && current.toLowerCase() === schema.doneValue.toLowerCase()) {
			return { ok: true, recordId, summary: '', provider: 'none', skipped: true };
		}
	}

	// Bitable-owned attachments need the table id + rev on the media download,
	// else Lark 400s. Missing rev degrades gracefully (download simply omits it).
	const rev = await bitableTableRevision(env, { appToken: schema.appToken, tableId: schema.tableId });
	const perm = rev !== undefined ? { tableId: schema.tableId, rev } : undefined;

	const extracted = await extractAttachmentsText(env, record.fields, perm);
	if (!extracted.text.trim()) {
		const diagnostics: DocHubFileDiagnostic[] = extracted.files.map((f) => ({
			name: f.name,
			status: f.status,
			chars: (f.text ?? '').trim().length,
			error: f.error
		}));
		const reason = extracted.files.length
			? `No usable text from ${extracted.files.length} attachment(s)`
			: 'Record has no attachment';
		await trySetStatus(env, schema, recordId, schema.failedValue);
		return { ok: false, recordId, reason, files: diagnostics };
	}

	const { summary, provider } = await summarizeDocumentText(env, extracted.text);
	if (!summary) {
		await trySetStatus(env, schema, recordId, schema.failedValue);
		return { ok: false, recordId, reason: 'LLM produced no summary (no provider available?)' };
	}

	if (!schema.contentField) {
		await trySetStatus(env, schema, recordId, schema.failedValue);
		return { ok: false, recordId, reason: 'Could not locate the Doc Content field in the table schema' };
	}

	const fields: Record<string, unknown> = { [schema.contentField]: summary };
	if (schema.statusField && schema.doneValue) fields[schema.statusField] = schema.doneValue;

	await bitableUpdateRecord(env, {
		appToken: schema.appToken,
		tableId: schema.tableId,
		recordId,
		fields
	});

	return { ok: true, recordId, summary, provider };
}
