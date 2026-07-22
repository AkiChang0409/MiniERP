/**
 * Doc Hub library reader — projects the Lark Bitable "Doc Hub" table into a
 * flat, display-ready shape for the My Space Doc Hub page.
 *
 * Read-only: pulls every record via `bitableListAllRecords`, decodes each
 * Bitable field value (which varies by field type — see `bitable-field-codec`)
 * into plain strings/arrays, and derives the distinct Project / Category /
 * File Type / Status facets used to populate the filter dropdowns.
 *
 * The table target is resolved from env (`larkDocHubTarget`); the app
 * (LARK_APP_ID) must be a collaborator on the Base or reads return empty.
 */
import {
	larkDocHubTarget,
	larkBitableAppToken,
	bitableListAllRecords,
	bitableTableRevision,
	type BitableFields
} from './bitable';
import { bitableNumber } from './bitable-field-codec';

/** Projects table id (for resolving Project link record ids → names). */
const PROJECTS_TABLE_FALLBACK = 'tblQzG5SD2URlzs6';
/** Primary (title) field of the Projects table. */
const PROJECT_NAME_FIELD = 'Project';

/** Doc Hub table field names (must match the Bitable schema, see reports/bitable-schema.json). */
const FIELD = {
	title: 'Doc Title',
	docId: 'Doc ID',
	fileLink: 'File link',
	attachment: 'Attachment File',
	content: 'Doc Content',
	category: 'Category',
	project: 'Project',
	fileType: 'File Type',
	source: 'Source',
	status: 'Processing Status',
	docStatus: 'Doc Status',
	label: 'Label',
	security: 'Security Classification',
	version: 'Version',
	owner: 'Owner',
	createdDate: 'Created Date'
} as const;

export interface DocHubAttachmentRef {
	fileToken: string;
	name: string;
	mimeType: string;
	size: number | null;
}

export interface DocHubLibraryItem {
	recordId: string;
	title: string;
	docId: string | null;
	/** Shared-document URL (Lark Doc / external link), if any. */
	fileLink: string | null;
	attachments: DocHubAttachmentRef[];
	/** AI/OCR summary written back by the auto-summary pipeline. */
	content: string | null;
	category: string | null;
	project: string | null;
	fileType: string | null;
	source: string | null;
	status: string | null;
	docStatus: string | null;
	labels: string[];
	security: string | null;
	version: number | null;
	owner: string | null;
	/** ISO date (yyyy-mm-dd) parsed from the Bitable ms timestamp, if present. */
	createdDate: string | null;
}

export interface DocHubLibrary {
	items: DocHubLibraryItem[];
	/** Current table revision — required to build attachment media-download perms. */
	revision: number | null;
	/** Distinct, sorted facet values for the filter dropdowns. */
	projects: string[];
	categories: string[];
	fileTypes: string[];
	statuses: string[];
}

/**
 * Human-readable text out of any Bitable field value. Handles the shapes the
 * `records/search` API actually returns:
 *   - Text: `[{ text, type }]` segment arrays
 *   - Single/multi-select: plain string / string[]
 *   - Lookup: `{ type, value: [...] }` (recurse into `value`)
 *   - Link fields sometimes carry display text under `text` / `text_arr`
 */
function displayText(value: unknown): string | null {
	if (value == null) return null;
	if (typeof value === 'string') return value.trim() || null;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
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
		if (Array.isArray(o.text_arr)) {
			const t = displayText(o.text_arr);
			if (t) return t;
		}
		if (o.value != null) {
			const v = displayText(o.value);
			if (v) return v;
		}
	}
	return null;
}

/**
 * Linked record ids from a Bitable link/duplex-link field. The search API
 * returns these as `{ link_record_ids: [...] }` (no display text), so the
 * linked names must be resolved separately against the target table.
 */
function linkRecordIds(value: unknown): string[] {
	if (!value) return [];
	if (Array.isArray(value)) return value.flatMap(linkRecordIds);
	if (typeof value === 'object') {
		const o = value as Record<string, unknown>;
		const ids = o.link_record_ids ?? o.record_ids ?? o.recordIds;
		if (Array.isArray(ids)) return ids.filter((x): x is string => typeof x === 'string');
		if (typeof o.record_id === 'string') return [o.record_id];
	}
	return [];
}

/** Split a comma-joined display value into distinct trimmed labels. */
function toLabels(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.flatMap(toLabels).filter((v, i, all) => v && all.indexOf(v) === i);
	}
	const text = displayText(value);
	if (!text) return [];
	return text
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

interface RawAttachment {
	file_token?: string;
	name?: string;
	type?: string;
	size?: number;
}

function decodeAttachments(value: unknown): DocHubAttachmentRef[] {
	if (!Array.isArray(value)) return [];
	const out: DocHubAttachmentRef[] = [];
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

/** URL field value is `{ link, text }` or a plain string — prefer the actual href. */
function decodeUrl(value: unknown): string | null {
	if (typeof value === 'string') return value.trim() || null;
	if (Array.isArray(value)) {
		for (const v of value) {
			const href = decodeUrl(v);
			if (href) return href;
		}
		return null;
	}
	if (value && typeof value === 'object') {
		const o = value as Record<string, unknown>;
		const href = o.link ?? o.url ?? o.text;
		return typeof href === 'string' && href.trim() ? href.trim() : null;
	}
	return null;
}

/** Bitable date/time comes back as a ms timestamp — normalize to an ISO date. */
function decodeDate(value: unknown): string | null {
	const ms = bitableNumber(value);
	if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
	const iso = new Date(ms).toISOString();
	return iso.slice(0, 10);
}

function sortedFacet(values: Array<string | null>): string[] {
	return Array.from(new Set(values.filter((v): v is string => Boolean(v)))).sort((a, b) =>
		a.localeCompare(b)
	);
}

function decodeItem(
	recordId: string,
	fields: BitableFields,
	projectNameById: Map<string, string>
): DocHubLibraryItem {
	// Project is a duplex link with no inline text — resolve ids → names.
	const projectNames = linkRecordIds(fields[FIELD.project])
		.map((id) => projectNameById.get(id))
		.filter((name): name is string => Boolean(name));
	const project = projectNames.length ? Array.from(new Set(projectNames)).join(', ') : null;

	return {
		recordId,
		title: displayText(fields[FIELD.title]) ?? '(untitled)',
		docId: displayText(fields[FIELD.docId]),
		fileLink: decodeUrl(fields[FIELD.fileLink]),
		attachments: decodeAttachments(fields[FIELD.attachment]),
		content: displayText(fields[FIELD.content]),
		category: displayText(fields[FIELD.category]),
		project,
		fileType: displayText(fields[FIELD.fileType]),
		source: displayText(fields[FIELD.source]),
		status: displayText(fields[FIELD.status]),
		docStatus: displayText(fields[FIELD.docStatus]),
		labels: toLabels(fields[FIELD.label]),
		security: displayText(fields[FIELD.security]),
		version: bitableNumber(fields[FIELD.version]),
		owner: displayText(fields[FIELD.owner]),
		createdDate: decodeDate(fields[FIELD.createdDate])
	};
}

/**
 * Build a `record_id → project name` map from the Projects table so Doc Hub's
 * duplex-link Project field (ids only) can be shown as names. Best-effort: on
 * any failure returns an empty map (Project simply shows blank).
 */
async function loadProjectNames(env: Env, appToken: string): Promise<Map<string, string>> {
	const tableId = env.LARK_PROJECT_TABLE_ID || PROJECTS_TABLE_FALLBACK;
	const map = new Map<string, string>();
	try {
		const records = await bitableListAllRecords(env, { appToken, tableId });
		for (const rec of records) {
			const name = displayText(rec.fields[PROJECT_NAME_FIELD]);
			if (name) map.set(rec.record_id, name);
		}
	} catch (err) {
		console.error('[doc-hub-library] failed to resolve project names:', err);
	}
	return map;
}

/** Fetch + decode the whole Doc Hub table into a display-ready library. */
export async function listDocHubLibrary(env: Env): Promise<DocHubLibrary> {
	const { appToken, tableId } = larkDocHubTarget(env);
	const [records, revision, projectNameById] = await Promise.all([
		bitableListAllRecords(env, { appToken, tableId }),
		bitableTableRevision(env, { appToken, tableId }),
		loadProjectNames(env, larkBitableAppToken(env))
	]);

	const items = records.map((r) => decodeItem(r.record_id, r.fields, projectNameById));
	// Newest first: sort by created date desc, undated last.
	items.sort((a, b) => (b.createdDate ?? '').localeCompare(a.createdDate ?? ''));

	return {
		items,
		revision: revision ?? null,
		projects: sortedFacet(items.map((i) => i.project)),
		categories: sortedFacet(items.map((i) => i.category)),
		fileTypes: sortedFacet(items.map((i) => i.fileType)),
		statuses: sortedFacet(items.map((i) => i.status))
	};
}

/** Attachment target (table id) needed to build the media-download perm. */
export function docHubTableId(env: Env): string {
	return larkDocHubTarget(env).tableId;
}
