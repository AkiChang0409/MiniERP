import { z } from 'zod';

/** Agent-facing input contract for `project.process-meeting-notes`. */
export const ProcessMeetingNotesInputSchema = z.object({
	rawTranscript: z.string().min(1),
	projectName: z.string().nullable().optional(),
	attendees: z.array(z.string()).optional()
});
