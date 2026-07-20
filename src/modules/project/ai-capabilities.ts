/**
 * Project agent raw read tools (unified-agent refactor).
 *
 * These replace the inner-LLM `project.answer` portfolio Q&A (which returned
 * `invalid_output` on the deployed model) with plain DATA tools: they read the
 * Bitable mirror Projects table (`bitable_records`, the source-of-truth read
 * path) and return normalized records. The unified agent loop composes the
 * answer from these — no second LLM inside the capability, so nothing to fail
 * schema validation.
 *
 * Boundary note: a capability may call platform integrations (module → platform
 * is allowed). Reading the mirror via `readBitableRecords` keeps the tool off
 * the legacy D1 `projects` table and on Bitable-as-source-of-truth.
 */
import { z } from 'zod';
import { readBitableRecords, normalizeMirrorRecord } from '$platform/integrations/lark/bitable-read';
import { bitableLinkedRecordIds } from '$platform/integrations/lark/bitable-field-codec';
import type { ProjectCapability } from './capabilities/types';

/** Fallback table ids (registry) when env is unset. */
const DEFAULT_PROJECTS_TABLE_ID = 'tblQzG5SD2URlzs6';
const DEFAULT_TASKS_TABLE_ID = 'tblW3ug6R6JTDPvd';

/** Field-name candidates used to surface a human-readable project name. */
const NAME_FIELD_CANDIDATES = ['Project Name', 'Name', 'Project', '项目名称', '项目', 'Title'];
/** Field-name candidates for a task's display name. */
const TASK_NAME_FIELD_CANDIDATES = ['Task', 'Task Name', 'Name', 'Title', '任务名称', '任务', '标题'];
/** Task column that links to the Projects table. */
const TASK_PROJECT_FIELD_CANDIDATES = ['Project', 'Projects', '🚩 Projects', '所属项目', '项目'];

const projectRecordSchema = z.object({
	recordId: z.string(),
	name: z.string().nullable(),
	fields: z.record(z.string(), z.string())
});

export const projectListProjectsInputSchema = z.object({
	limit: z.number().int().min(1).max(200).optional().describe('Maximum projects to return.')
});

export const projectGetProjectInputSchema = z.object({
	recordId: z.string().min(1).describe('Bitable Projects record id.')
});

const projectListProjectsOutputSchema = z.object({
	count: z.number().int(),
	returned: z.number().int(),
	truncated: z.boolean(),
	projects: z.array(projectRecordSchema)
});

const projectGetProjectOutputSchema = z.object({
	project: projectRecordSchema.nullable()
});

type ProjectListProjectsInput = z.infer<typeof projectListProjectsInputSchema>;
type ProjectGetProjectInput = z.infer<typeof projectGetProjectInputSchema>;
type ProjectListProjectsOutput = z.infer<typeof projectListProjectsOutputSchema>;
type ProjectGetProjectOutput = z.infer<typeof projectGetProjectOutputSchema>;

function projectsTableId(env: Env): string {
	return env.LARK_PROJECT_TABLE_ID ?? DEFAULT_PROJECTS_TABLE_ID;
}

// Uses the shared `normalizeMirrorRecord` (B5 dedupe): flatten every field to
// text + pick a name from candidates. Thin per-entity wrappers below.
const normalizeProject = (record: { recordId: string; fields: Record<string, unknown> }) =>
	normalizeMirrorRecord(record, NAME_FIELD_CANDIDATES);
const normalizeTask = (record: { recordId: string; fields: Record<string, unknown> }) =>
	normalizeMirrorRecord(record, TASK_NAME_FIELD_CANDIDATES);

function tasksTableId(env: Env): string {
	return env.LARK_TASK_TABLE_ID ?? DEFAULT_TASKS_TABLE_ID;
}

/** Whether a Tasks mirror record links to the given Bitable project record id. */
function taskLinksToProject(
	record: { fields: Record<string, unknown> },
	projectRecordId: string
): boolean {
	for (const candidate of TASK_PROJECT_FIELD_CANDIDATES) {
		if (candidate in record.fields) {
			return bitableLinkedRecordIds(record.fields[candidate]).includes(projectRecordId);
		}
	}
	return false;
}

export const projectListProjectsCapability: ProjectCapability<
	ProjectListProjectsInput,
	ProjectListProjectsOutput
> = {
	id: 'project.list-projects',
	description:
		'List projects from the Projects table (Bitable source of truth). Returns each project record with its fields as plain text.',
	riskLevel: 'R1',
	inputSchema: projectListProjectsInputSchema,
	outputSchema: projectListProjectsOutputSchema,

	async execute(input, ctx): Promise<ProjectListProjectsOutput> {
		if (!ctx.moduleContext) throw new Error('project.list-projects requires a module context');
		const { db, env } = ctx.moduleContext;
		const records = await readBitableRecords(db, projectsTableId(env));
		const projects = records.map(normalizeProject);
		const limit = input.limit ?? 100;
		const selected = projects.slice(0, limit);
		return {
			count: projects.length,
			returned: selected.length,
			truncated: projects.length > selected.length,
			projects: selected
		};
	}
};

export const projectGetProjectCapability: ProjectCapability<
	ProjectGetProjectInput,
	ProjectGetProjectOutput
> = {
	id: 'project.get-project',
	description: 'Get one project by its Bitable record id (Projects table, source of truth).',
	riskLevel: 'R1',
	inputSchema: projectGetProjectInputSchema,
	outputSchema: projectGetProjectOutputSchema,

	async execute(input, ctx): Promise<ProjectGetProjectOutput> {
		if (!ctx.moduleContext) throw new Error('project.get-project requires a module context');
		const { db, env } = ctx.moduleContext;
		const records = await readBitableRecords(db, projectsTableId(env));
		const match = records.find((r) => r.recordId === input.recordId);
		return { project: match ? normalizeProject(match) : null };
	}
};

// --- Tasks (P3 read-from-Bitable: closes the write→read loop) --------------

export const projectListTasksInputSchema = z.object({
	projectId: z
		.string()
		.optional()
		.describe('Bitable Projects record id — filter to tasks linked to this project.'),
	limit: z.number().int().min(1).max(200).optional().describe('Maximum tasks to return.')
});

export const projectGetTaskInputSchema = z.object({
	recordId: z.string().min(1).describe('Bitable Tasks record id.')
});

const projectListTasksOutputSchema = z.object({
	count: z.number().int(),
	returned: z.number().int(),
	truncated: z.boolean(),
	tasks: z.array(projectRecordSchema)
});

const projectGetTaskOutputSchema = z.object({
	task: projectRecordSchema.nullable()
});

type ProjectListTasksInput = z.infer<typeof projectListTasksInputSchema>;
type ProjectGetTaskInput = z.infer<typeof projectGetTaskInputSchema>;
type ProjectListTasksOutput = z.infer<typeof projectListTasksOutputSchema>;
type ProjectGetTaskOutput = z.infer<typeof projectGetTaskOutputSchema>;

export const projectListTasksCapability: ProjectCapability<
	ProjectListTasksInput,
	ProjectListTasksOutput
> = {
	id: 'project.list-tasks',
	description:
		'List tasks from the Tasks table (Bitable source of truth). Optionally filter to one project by its Bitable record id. Returns each task record with its fields as plain text.',
	riskLevel: 'R1',
	inputSchema: projectListTasksInputSchema,
	outputSchema: projectListTasksOutputSchema,

	async execute(input, ctx): Promise<ProjectListTasksOutput> {
		if (!ctx.moduleContext) throw new Error('project.list-tasks requires a module context');
		const { db, env } = ctx.moduleContext;
		const records = await readBitableRecords(db, tasksTableId(env));
		const filtered = input.projectId
			? records.filter((r) => taskLinksToProject(r, input.projectId!))
			: records;
		const tasks = filtered.map(normalizeTask);
		const limit = input.limit ?? 100;
		const selected = tasks.slice(0, limit);
		return {
			count: tasks.length,
			returned: selected.length,
			truncated: tasks.length > selected.length,
			tasks: selected
		};
	}
};

export const projectGetTaskCapability: ProjectCapability<
	ProjectGetTaskInput,
	ProjectGetTaskOutput
> = {
	id: 'project.get-task',
	description: 'Get one task by its Bitable record id (Tasks table, source of truth).',
	riskLevel: 'R1',
	inputSchema: projectGetTaskInputSchema,
	outputSchema: projectGetTaskOutputSchema,

	async execute(input, ctx): Promise<ProjectGetTaskOutput> {
		if (!ctx.moduleContext) throw new Error('project.get-task requires a module context');
		const { db, env } = ctx.moduleContext;
		const records = await readBitableRecords(db, tasksTableId(env));
		const match = records.find((r) => r.recordId === input.recordId);
		return { task: match ? normalizeTask(match) : null };
	}
};

/** Raw data read tools for the Project agent (composed by the unified loop). */
export const projectAiCapabilities = [
	projectListProjectsCapability,
	projectGetProjectCapability,
	projectListTasksCapability,
	projectGetTaskCapability
] as const;
