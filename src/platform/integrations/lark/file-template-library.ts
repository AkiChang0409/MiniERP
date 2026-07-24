/**
 * File Template library reader — projects the Lark Bitable "File Template" table
 * (the ISO 9001 QMS template master data + blank template files) into a flat,
 * display-ready shape for the QMS template gallery.
 *
 * Read-only: Bitable is the source of truth. The blank template file lives in the
 * table's `File` attachment field; its bytes are streamed through
 * `/api/qms/file-template/attachment`. Mirrors `doc-hub-library.ts`.
 *
 * The app (LARK_APP_ID) must be a collaborator on the Base or reads return empty.
 */
import {
	larkBitableAppToken,
	bitableListAllRecords,
	bitableTableRevision,
	type BitableFields
} from './bitable';

/** File Template table id (stable, from the Base registry). */
const FILE_TEMPLATE_TABLE_ID = 'tblP6qV21OatoslO';

/** Resolve the File Template table id. */
export function fileTemplateTableId(): string {
	return FILE_TEMPLATE_TABLE_ID;
}

/**
 * File Template table field names (must match the Bitable schema).
 * `Field Schema` and `Reference Only` are the two columns added for the ISO 9001
 * fill-and-generate design — read defensively so the reader still works before
 * they exist in the Base.
 */
const FIELD = {
	name: 'Name',
	code: 'File Code',
	category: 'Category',
	scope: 'Scope',
	taskMatch: 'Task Match',
	role: 'Role',
	needApproval: 'Need Approval',
	isActive: 'Is Active',
	file: 'File',
	info: 'Info',
	fieldSchema: 'Field Schema',
	referenceOnly: 'Reference Only'
} as const;

export interface FileTemplateAttachment {
	fileToken: string;
	name: string;
	mimeType: string;
	size: number | null;
}

export interface FileTemplateItem {
	recordId: string;
	name: string;
	code: string | null;
	category: string | null;
	scope: string | null;
	taskMatch: string | null;
	role: string | null;
	needApproval: boolean;
	isActive: boolean;
	/** true = download-only reference doc (e.g. the ISO implementation guide). */
	referenceOnly: boolean;
	/** JSON describing the fill form + placeholders; null until configured. */
	fieldSchema: string | null;
	info: string | null;
	/** The blank template file (first attachment in the `File` field), if any. */
	file: FileTemplateAttachment | null;
}

export interface FileTemplateLibrary {
	items: FileTemplateItem[];
	/** Current table revision — needed to build attachment media-download perms. */
	revision: number | null;
	/** Distinct, sorted category values for grouping / filtering. */
	categories: string[];
}

/** Human-readable text out of a Bitable field value (text/select/lookup shapes). */
function displayText(value: unknown): string | null {
	if (value == null) return null;
	if (typeof value === 'string') return value.trim() || null;
	if (typeof value === 'number') return String(value);
	if (typeof value === 'boolean') return value ? 'true' : null;
	if (Array.isArray(value)) {
		const parts = value.map(displayText).filter((p): p is string => Boolean(p));
		return parts.length ? Array.from(new Set(parts)).join(', ') : null;
	}
	if (typeof value === 'object') {
		const o = value as Record<string, unknown>;
		if (typeof o.text === 'string' && o.text.trim()) return o.text.trim();
		if (o.name != null) {
			const n = displayText(o.name);
			if (n) return n;
		}
		if (o.value != null) {
			const v = displayText(o.value);
			if (v) return v;
		}
	}
	return null;
}

/** Bitable checkbox → boolean (comes back as a real boolean, but be lenient). */
function decodeBool(value: unknown): boolean {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'string') return value === 'true' || value === '1';
	if (typeof value === 'number') return value !== 0;
	return false;
}

interface RawAttachment {
	file_token?: string;
	name?: string;
	type?: string;
	size?: number;
}

function decodeAttachments(value: unknown): FileTemplateAttachment[] {
	if (!Array.isArray(value)) return [];
	const out: FileTemplateAttachment[] = [];
	for (const raw of value as RawAttachment[]) {
		if (!raw || typeof raw !== 'object' || typeof raw.file_token !== 'string') continue;
		out.push({
			fileToken: raw.file_token,
			name: raw.name ?? raw.file_token,
			mimeType: raw.type ?? 'application/octet-stream',
			size: typeof raw.size === 'number' ? raw.size : null
		});
	}
	return out;
}

function decodeItem(recordId: string, fields: BitableFields): FileTemplateItem {
	return {
		recordId,
		name: displayText(fields[FIELD.name]) ?? '(untitled)',
		code: displayText(fields[FIELD.code]),
		category: displayText(fields[FIELD.category]),
		scope: displayText(fields[FIELD.scope]),
		taskMatch: displayText(fields[FIELD.taskMatch]),
		role: displayText(fields[FIELD.role]),
		needApproval: decodeBool(fields[FIELD.needApproval]),
		isActive: decodeBool(fields[FIELD.isActive]),
		referenceOnly: decodeBool(fields[FIELD.referenceOnly]),
		fieldSchema: displayText(fields[FIELD.fieldSchema]),
		info: displayText(fields[FIELD.info]),
		file: decodeAttachments(fields[FIELD.file])[0] ?? null
	};
}

/** Fetch + decode the whole File Template table into a display-ready library. */
export async function listFileTemplates(env: Env): Promise<FileTemplateLibrary> {
	const appToken = larkBitableAppToken(env);
	const tableId = fileTemplateTableId();
	const [records, revision] = await Promise.all([
		bitableListAllRecords(env, { appToken, tableId }),
		bitableTableRevision(env, { appToken, tableId })
	]);

	const items = records.map((r) => decodeItem(r.record_id, r.fields));
	// Group-friendly order: by category, then name.
	items.sort(
		(a, b) => (a.category ?? '~').localeCompare(b.category ?? '~') || a.name.localeCompare(b.name)
	);

	const categories = Array.from(
		new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c)))
	).sort((a, b) => a.localeCompare(b));

	return { items, revision: revision ?? null, categories };
}
