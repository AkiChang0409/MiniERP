import { z } from 'zod';
import { runStructuredOutput } from '$platform/ai/ai-runtime';
import type { ProjectCapability } from '../types';
import { DraftAgendaInputSchema } from './schema';

/**
 * Epic 6 — Meeting Assistant.
 *
 * Given a project's open tasks + recent decisions, draft a meeting agenda
 * with time allocations. The route is responsible for sending invites via
 * the calendar OAuth (Epic 5) — this capability only produces the agenda.
 */

const AgendaItemSchema = z.object({
	title: z.string().min(1),
	durationMinutes: z.number().int().min(1).max(120),
	owner: z.string().nullable().optional(),
	notes: z.string().optional()
});

const MeetingAgendaSchema = z.object({
	title: z.string().min(1),
	objective: z.string().min(1),
	suggestedAttendees: z.array(z.string()).max(20),
	totalMinutes: z.number().int().min(5).max(240),
	items: z.array(AgendaItemSchema).min(1).max(15)
});

export type MeetingAgenda = z.infer<typeof MeetingAgendaSchema>;

export interface DraftAgendaInput {
	projectName: string;
	objective: string;
	openTaskNames: string[];
	recentComments: string[];
	desiredMinutes?: number;
}

const SYSTEM_PROMPT = `You are a meeting facilitator. Draft a focused agenda
that fits within the requested duration. Surface only the open items that
need discussion — skip status updates that can be read async. Each agenda
item has a clear owner where the source data names one. Output JSON only.`;

export async function draftMeetingAgenda(
	input: DraftAgendaInput,
	env: Env
): Promise<{ agenda: MeetingAgenda | null; status: string }> {
	const messages = [
		{ role: 'system' as const, content: SYSTEM_PROMPT },
		{
			role: 'user' as const,
			content: `Project: ${input.projectName}
Meeting objective: ${input.objective}
${input.desiredMinutes ? `Target duration: ${input.desiredMinutes} minutes` : ''}
Open tasks:
${input.openTaskNames.map((t) => ` - ${t}`).join('\n')}
Recent discussion snippets:
${input.recentComments.map((c) => ` * ${c}`).join('\n')}

Return JSON with title, objective, suggestedAttendees, totalMinutes, items[].`
		}
	];

	const result = await runStructuredOutput({
		task: 'project.draft-meeting-agenda',
		messages,
		schema: MeetingAgendaSchema,
		schemaName: 'project.meeting-agenda',
		schemaVersion: 'v1',
		modelHint: { capability: 'reasoning', priority: 'balanced' },
		metadata: {
			tenantId: 'default',
			capabilityId: 'project.draft-meeting-agenda',
			promptVersion: 'v1',
			schemaVersion: 'v1',
			riskLevel: 'R0'
		},
		env
	});

	if (result.status !== 'success') {
		return { agenda: null, status: result.status };
	}
	return { agenda: result.result.value, status: 'success' };
}

/** Registered (SDK-for-agent) wrapper — forwards to `draftMeetingAgenda`. */
export const draftMeetingAgendaCapability: ProjectCapability<DraftAgendaInput, MeetingAgenda> = {
	id: 'project.draft-meeting-agenda',
	description:
		'Draft a focused, time-boxed meeting agenda from a project objective, open tasks and recent discussion. Suggestive only — does not send invites.',
	riskLevel: 'R0',
	inputSchema: DraftAgendaInputSchema,
	outputSchema: MeetingAgendaSchema,

	async execute(input, ctx) {
		if (!ctx.env) throw new Error('project.draft-meeting-agenda requires Workers AI env');
		const run = await draftMeetingAgenda(input, ctx.env);
		if (run.status !== 'success' || !run.agenda) {
			throw new Error(`Agenda generation failed (${run.status}).`);
		}
		return run.agenda;
	}
};
