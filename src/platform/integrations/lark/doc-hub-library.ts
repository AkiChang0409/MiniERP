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
	bitableListAllRecords,
	bitableTableRevision,
	type BitableFields
} from './bitable';
import { bitablePlainText, bitableNumber } from './bitable-field-codec';

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
 * Text extraction that also understands Lark link/lookup shapes which carry
 * their display text under `text_arr` (an array) rather than `text`.
 * Falls back to the shared `bitablePlainText` codec for everything else.
 */
function displayText(value: unknown): string | null {
	if (Array.isArray(value)) {
		const parts = value.map(displayText).filter((p): p is string => Boolean(p));
		return parts.length ? Array.from(new Set(parts)).join(', ') : null;
	}
	if (value && typeof value === 'object') {
		const o = value as Record<string, unknown>;
		if (Array.isArray(o.text_arr)) {
			const joined = displayText(o.text_arr);
			if (joined) return joined;
		}
	}
	return bitablePlainText(value);
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

function decodeItem(recordId: string, fields: BitableFields): DocHubLibraryItem {
	return {
		recordId,
		title: displayText(fields[FIELD.title]) ?? '(untitled)',
		docId: displayText(fields[FIELD.docId]),
		fileLink: decodeUrl(fields[FIELD.fileLink]),
		attachments: decodeAttachments(fields[FIELD.attachment]),
		content: displayText(fields[FIELD.content]),
		category: displayText(fields[FIELD.category]),
		project: displayText(fields[FIELD.project]),
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

/** Fetch + decode the whole Doc Hub table into a display-ready library. */
export async function listDocHubLibrary(env: Env): Promise<DocHubLibrary> {
	const { appToken, tableId } = larkDocHubTarget(env);
	const [records, revision] = await Promise.all([
		bitableListAllRecords(env, { appToken, tableId }),
		bitableTableRevision(env, { appToken, tableId })
	]);

	const items = records.map((r) => decodeItem(r.record_id, r.fields));
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
