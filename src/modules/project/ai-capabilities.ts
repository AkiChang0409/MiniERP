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
import { readBitableRecords, bitableText } from '$platform/integrations/lark/bitable-read';
import type { ProjectCapability } from './capabilities/types';

/** Fallback Projects table id (registry `tblQzG5SD2URlzs6`) when env is unset. */
const DEFAULT_PROJECTS_TABLE_ID = 'tblQzG5SD2URlzs6';

/** Field-name candidates used to surface a human-readable project name. */
const NAME_FIELD_CANDIDATES = ['Project Name', 'Name', 'Project', '项目名称', '项目', 'Title'];

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

/** Normalize a mirror record into `{ recordId, name, fields }` (all plain text). */
function normalizeProject(record: { recordId: string; fields: Record<string, unknown> }): {
	recordId: string;
	name: string | null;
	fields: Record<string, string>;
} {
	const fields: Record<string, string> = {};
	for (const [fieldName, value] of Object.entries(record.fields)) {
		const text = bitableText(value);
		if (text) fields[fieldName] = text;
	}
	let name: string | null = null;
	for (const candidate of NAME_FIELD_CANDIDATES) {
		if (fields[candidate]) {
			name = fields[candidate];
			break;
		}
	}
	if (!name) {
		// Fall back to the first non-empty text field so lists are never nameless.
		const first = Object.values(fields)[0];
		name = first ?? null;
	}
	return { recordId: record.recordId, name, fields };
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

/** Raw data read tools for the Project agent (composed by the unified loop). */
export const projectAiCapabilities = [
	projectListProjectsCapability,
	projectGetProjectCapability
] as const;
