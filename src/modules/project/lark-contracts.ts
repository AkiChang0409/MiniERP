/**
 * Lark Bitable "Tasks" table contract for project write-through (B4).
 *
 * Unlike sales-crm's static Business Partner contract, the Tasks table schema
 * was not known at build time, so this contract resolves the real column names
 * at RUNTIME from `bitableListFields` (cached per table id), matching each
 * logical field against a list of candidate labels (EN + ZH). The encoder only
 * writes fields that actually resolved, coerces by the live field TYPE (date →
 * ms timestamp, single-select → a matching live option), and drops empties — so
 * a slightly different real schema degrades gracefully instead of erroring.
 *
 * Bitable field type codes used here: 1 text, 2 number, 3 single-select,
 * 5 date, 18 single-link, 21 duplex-link.
 */
import { bitableListFields, type BitableFieldDef } from '$platform/integrations/lark/bitable';
import type { BitableRawFields } from '$platform/integrations/lark/bitable-field-codec';

/**
 * Logical task field → candidate Bitable column labels (case-insensitive). The
 * FIRST entry of each list is the confirmed real column name in the Tasks table
 * (see below); the rest are fallbacks so minor schema drift still resolves.
 *
 * Confirmed Tasks columns (2026-07): Task, Project, Priority, Status, Assignee,
 * Start date, End date, Task ID, Task Type, A-Start Date, A-End Date, Progress,
 * pre-Task, Post-Task, Related Requirement, QA & Test, IsOutsourcing, Outsourced
 * Partner, Buffer Days, Block Reason, Customer, QMS Record, Task Details,
 * Members, Task Attachment, Task ISO File, Risks.
 *
 * We only write the fields the governed task capabilities actually carry (name /
 * details / dates / status / progress / project link). Person fields (Assignee,
 * Members) need Lark open_ids and are intentionally not written here; Task ID is
 * system-generated; attachments/links other than Project are out of scope.
 */
const TASK_FIELD_ALIASES = {
	name: ['Task', 'Task Name', 'Name', 'Title', '任务名称', '任务名', '任务', '标题'],
	description: ['Task Details', 'Description', 'Details', 'Detail', 'Notes', 'Remark', '描述', '备注', '说明', '详情'],
	startDate: ['Start date', 'Start Date', 'Start', 'Start Time', 'Planned Start', '开始日期', '开始时间', '计划开始', '起始日期'],
	endDate: ['End date', 'End Date', 'Due Date', 'Due', 'End', 'Deadline', 'Finish Date', '结束日期', '截止日期', '计划结束', '到期日', '完成日期'],
	status: ['Status', 'State', 'Task Status', '状态', '进度状态', '任务状态'],
	priority: ['Priority', '优先级'],
	progress: ['Progress', 'Progress %', 'Completion', '进度', '完成度', '完成百分比'],
	project: ['Project', 'Projects', '🚩 Projects', '所属项目', '项目', '关联项目']
} as const;

/** Confirmed Priority single-select options (P0 highest). */
export const TASK_PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'] as const;

export type TaskLogicalField = keyof typeof TASK_FIELD_ALIASES;

export interface ResolvedTaskField {
	name: string;
	type: number;
	options: string[];
}

export type ResolvedTaskFields = Partial<Record<TaskLogicalField, ResolvedTaskField>>;

/**
 * D1 task status → candidate Bitable single-select option labels. The first
 * entry is the confirmed real option; the D1 enum has no analogue for the Base's
 * extra "Not started" / "Cancelled" options, so we never emit those.
 * Confirmed Status options: Unassigned, Not started, In Progress, Under Review,
 * Completed, Cancelled, Blocked.
 */
const STATUS_OPTION_ALIASES: Record<string, string[]> = {
	unassigned: ['Unassigned', '未分配', '待办'],
	ongoing: ['In Progress', 'Ongoing', 'Doing', '进行中', '处理中'],
	under_review: ['Under Review', 'Review', 'In Review', '审核中', '评审'],
	completed: ['Completed', 'Done', 'Finished', 'Complete', '已完成', '完成'],
	blocked: ['Blocked', 'On Hold', 'Stuck', '阻塞', '受阻']
};

const fieldCache = new Map<string, ResolvedTaskFields>();

function norm(value: string): string {
	return value.trim().toLowerCase();
}

/**
 * Resolve the live Tasks table columns into our logical field map (cached per
 * table id per isolate). Returns whichever logical fields matched a real column.
 */
export async function resolveTaskFields(
	env: Env,
	appToken: string,
	tableId: string
): Promise<ResolvedTaskFields> {
	const cached = fieldCache.get(tableId);
	if (cached) return cached;

	const defs = await bitableListFields(env, { appToken, tableId });
	const byName = new Map<string, BitableFieldDef>(defs.map((d) => [norm(d.name), d]));

	const resolved: ResolvedTaskFields = {};
	for (const key of Object.keys(TASK_FIELD_ALIASES) as TaskLogicalField[]) {
		for (const alias of TASK_FIELD_ALIASES[key]) {
			const def = byName.get(norm(alias));
			if (def) {
				resolved[key] = { name: def.name, type: def.type, options: def.options };
				break;
			}
		}
	}
	fieldCache.set(tableId, resolved);
	return resolved;
}

/** Match a D1 status to one of the live single-select options, or null. */
function matchStatusOption(options: string[], d1Status: string): string | null {
	const aliases = STATUS_OPTION_ALIASES[d1Status] ?? [d1Status];
	const wanted = new Set(aliases.map(norm));
	for (const opt of options) {
		if (wanted.has(norm(opt))) return opt;
	}
	return null;
}

/** Case-insensitive exact match of a value against the live single-select options. */
function matchExactOption(options: string[], value: string): string | null {
	const wanted = norm(value);
	for (const opt of options) {
		if (norm(opt) === wanted) return opt;
	}
	return null;
}

/** The normalized task values a write-through may carry (all optional). */
export interface TaskWriteValues {
	name?: string | null;
	description?: string | null;
	startDate?: string | null;
	endDate?: string | null;
	status?: string | null;
	/** One of TASK_PRIORITY_OPTIONS (P0–P3); matched against the live options. */
	priority?: string | null;
	progressPct?: number | null;
}

/**
 * Encode task values onto the resolved Bitable columns. Only resolved fields are
 * written; dates on a date-typed column become ms timestamps; status maps to a
 * live option; the project link (if resolved + a link field) gets the Bitable
 * Projects record id. Empty/unknown values are dropped.
 */
export function encodeTaskFields(
	resolved: ResolvedTaskFields,
	values: TaskWriteValues,
	projectRecordId?: string
): BitableRawFields {
	const fields: BitableRawFields = {};

	if (resolved.name && values.name != null && values.name !== '') {
		fields[resolved.name.name] = values.name;
	}
	if (resolved.description && values.description != null && values.description !== '') {
		fields[resolved.description.name] = values.description;
	}

	for (const key of ['startDate', 'endDate'] as const) {
		const field = resolved[key];
		const value = values[key];
		if (!field || !value) continue;
		if (field.type === 5) {
			const ms = Date.parse(value);
			if (!Number.isNaN(ms)) fields[field.name] = ms;
		} else {
			fields[field.name] = value; // text/other column → keep the ISO string
		}
	}

	if (resolved.progress && typeof values.progressPct === 'number' && resolved.progress.type === 2) {
		fields[resolved.progress.name] = values.progressPct;
	}

	if (resolved.status && values.status) {
		const option = matchStatusOption(resolved.status.options, values.status);
		if (option) fields[resolved.status.name] = option;
	}

	if (resolved.priority && values.priority) {
		const option = matchExactOption(resolved.priority.options, values.priority);
		if (option) fields[resolved.priority.name] = option;
	}

	if (
		resolved.project &&
		projectRecordId &&
		(resolved.project.type === 18 || resolved.project.type === 21)
	) {
		fields[resolved.project.name] = [projectRecordId];
	}

	return Object.fromEntries(
		Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== '')
	);
}
