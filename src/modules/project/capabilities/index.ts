import { answerQuestionCapability } from './answer-question';
import { draftMeetingAgendaCapability } from './meeting-agenda';
import { extractTasksCapability } from './extract-tasks';
import { generatePlanCapability } from './generate-plan';
import { processMeetingNotesCapability } from './meeting-notes';
import { summarizeDashboardCapability } from './summarize-dashboard';

export { projectActions } from './agent-actions';
export type { ProjectCapability, PlatformCapabilityContext } from './types';

/**
 * Registered (SDK-for-agent) project capabilities. Each is a thin governance
 * wrapper around the module's LLM functions: it carries a Zod `inputSchema`
 * (serialized into an LLM tool spec by the platform registry) plus an
 * `outputSchema`, and forwards to the underlying function. All are read-only /
 * suggestive (R0-R1), so the route layer keeps calling the plain functions
 * directly for its existing status-code handling.
 */
export const projectCapabilities = [
	generatePlanCapability,
	summarizeDashboardCapability,
	answerQuestionCapability,
	extractTasksCapability,
	draftMeetingAgendaCapability,
	processMeetingNotesCapability
] as const;

export const projectCapabilityIds = projectCapabilities.map((capability) => capability.id);
