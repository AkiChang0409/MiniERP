import { z } from 'zod';
import { runStructuredOutput } from '$platform/ai/ai-runtime';
import type { ProjectCapability } from '../types';
import { ProcessMeetingNotesInputSchema } from './schema';

/**
 * Epic 8 — Meeting Notetaker (file-upload path).
 *
 * The bot-in-meeting flow (joining Zoom/Meet/Teams as a participant) needs
 * vendor-specific SDKs and credentials. This v1 capability handles the
 * "operator uploads the transcript/notes" branch — they paste or upload
 * the text, the LLM extracts decisions + action items with owners.
 *
 * The route layer is responsible for promoting actions to tasks via the
 * existing /api/projects/[id]/tasks endpoint, same pattern as extract-tasks.
 */

const ActionItemSchema = z.object({
	description: z.string().min(1),
	owner: z.string().nullable(),
	dueDate: z.string().nullable(),
	confidence: z.number().min(0).max(1)
});

const MeetingNotesSchema = z.object({
	summary: z.string().min(1),
	decisions: z.array(z.string().min(1)).max(20),
	actionItems: z.array(ActionItemSchema).max(30),
	risks: z.array(z.string()).max(10)
});

export type MeetingNotes = z.infer<typeof MeetingNotesSchema>;

export interface ProcessMeetingNotesInput {
	rawTranscript: string;
	projectName?: string | null;
	attendees?: string[];
}

const SYSTEM_PROMPT = `Read the meeting transcript and produce:
 - A 2-3 sentence executive summary.
 - The decisions reached (concrete + verifiable).
 - The action items — who owns each, by when (ISO date if mentioned).
 - Any risks or blockers raised.
Be strict: do NOT invent owners or dates. If unclear, set owner=null,
dueDate=null, and lower the confidence. Output JSON only.`;

export async function processMeetingTranscript(
	input: ProcessMeetingNotesInput,
	env: Env
): Promise<{ notes: MeetingNotes | null; status: string }> {
	if (!input.rawTranscript.trim()) {
		return { notes: null, status: 'empty_input' };
	}
	const text = input.rawTranscript.slice(0, 32_000);

	const messages = [
		{ role: 'system' as const, content: SYSTEM_PROMPT },
		{
			role: 'user' as const,
			content: `${input.projectName ? `Project: ${input.projectName}\n` : ''}${
				input.attendees && input.attendees.length > 0
					? `Attendees: ${input.attendees.join(', ')}\n`
					: ''
			}Transcript:
"""
${text}
"""`
		}
	];

	const result = await runStructuredOutput({
		task: 'project.process-meeting-notes',
		messages,
		schema: MeetingNotesSchema,
		schemaName: 'project.meeting-notes',
		schemaVersion: 'v1',
		modelHint: { capability: 'long_context', priority: 'quality' },
		metadata: {
			tenantId: 'default',
			capabilityId: 'project.process-meeting-notes',
			promptVersion: 'v1',
			schemaVersion: 'v1',
			riskLevel: 'R1'
		},
		env
	});

	if (result.status !== 'success') {
		return { notes: null, status: result.status };
	}
	return { notes: result.result.value, status: 'success' };
}

/** Registered (SDK-for-agent) wrapper — forwards to `processMeetingTranscript`. */
export const processMeetingNotesCapability: ProjectCapability<
	ProcessMeetingNotesInput,
	MeetingNotes
> = {
	id: 'project.process-meeting-notes',
	description:
		'Turn a meeting transcript into a summary, decisions, action items (with owners/dates) and risks. Suggestive only — actions become tasks after user review.',
	riskLevel: 'R1',
	inputSchema: ProcessMeetingNotesInputSchema,
	outputSchema: MeetingNotesSchema,

	async execute(input, ctx) {
		if (!ctx.env) throw new Error('project.process-meeting-notes requires Workers AI env');
		const run = await processMeetingTranscript(input, ctx.env);
		if (run.status !== 'success' || !run.notes) {
			throw new Error(`Meeting-notes processing failed (${run.status}).`);
		}
		return run.notes;
	}
};
