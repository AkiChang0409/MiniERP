import { answerQuestionCapability } from './answer-question';
import { applyTaskChangeSetCapability } from './apply-task-change-set';
import { createTaskCapability } from './create-task';
import { detectScheduleConflictsCapability } from './detect-schedule-conflicts';
import { draftMeetingAgendaCapability } from './meeting-agenda';
import { extractTasksCapability } from './extract-tasks';
import { generatePlanCapability } from './generate-plan';
import { processMeetingNotesCapability } from './meeting-notes';
import { proposeAssignmentCapability } from './propose-assignment';
import { proposeRescheduleCapability } from './propose-reschedule';
import { proposeTaskPlanCapability } from './propose-task-plan';
import { summarizeDashboardCapability } from './summarize-dashboard';
import { updateTaskCapability } from './update-task';
import { viewCalendarCapability } from './view-calendar';

export { projectActions } from './agent-actions';
export type { ProjectCapability, PlatformCapabilityContext } from './types';
export {
	ProjectDraftActionSchema,
	ProjectChangeSchema,
	DraftTaskRefSchema,
	type ProjectDraftAction,
	type ProjectChange,
	type DraftTaskRef
} from './draft-action';
export { type ProposeTaskPlanInput } from './propose-task-plan';
export { type ProposeRescheduleInput } from './propose-reschedule';
export { type ProposeAssignmentInput } from './propose-assignment';
export { type DetectScheduleConflictsInput } from './detect-schedule-conflicts';
export { type CreateTaskInput, type CreateTaskOutput } from './create-task';
export { type UpdateTaskInput, type UpdateTaskOutput } from './update-task';
export {
	type ApplyTaskChangeSetInput,
	type ApplyTaskChangeSetOutput
} from './apply-task-change-set';

/**
 * Registered (SDK-for-agent) project capabilities. Each is a thin governance
 * wrapper around the module's LLM functions: it carries a Zod `inputSchema`
 * (serialized into an LLM tool spec by the platform registry) plus an
 * `outputSchema`, and forwards to the underlying function. All are read-only /
 * suggestive (R0-R1), so the route layer keeps calling the plain functions
 * directly for its existing status-code handling.
 *
 * `view-calendar` is the exception in KIND (not in risk): a data-read capability
 * that forwards to the api facade (`createProjectApi(ctx.moduleContext)`) rather
 * than an LLM function — still read-only.
 */
export const projectCapabilities = [
	generatePlanCapability,
	summarizeDashboardCapability,
	answerQuestionCapability,
	extractTasksCapability,
	draftMeetingAgendaCapability,
	processMeetingNotesCapability,
	viewCalendarCapability,
	// Stage-2 draft proposals (R3, read-only — reviewed before any write).
	proposeTaskPlanCapability,
	proposeRescheduleCapability,
	proposeAssignmentCapability,
	detectScheduleConflictsCapability,
	// Stage-3 governed writes (R4, require confirmation). update-task also covers
	// reschedule + assignment via its patch fields; apply-task-change-set applies
	// a confirmed draft change set (the "apply" end of the write loop).
	createTaskCapability,
	updateTaskCapability,
	applyTaskChangeSetCapability
] as const;

export const projectCapabilityIds = projectCapabilities.map((capability) => capability.id);
