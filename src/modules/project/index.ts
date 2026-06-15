import { projectAppSurface } from './app';
import { projectActions, projectCapabilities, projectCapabilityIds } from './capabilities';
import { projectModule, projectManifestV2 } from './module';
import { projectWorkflows, projectWorkflowIds } from './workflows';

export { createProjectApi, type ProjectApi } from './services';
export { ProjectPermissionError, ProjectValidationError, computeNextDeadline } from './domain';
export type {
	ProjectCreateInput,
	ProjectUpdateInput
} from './services/project-lifecycle-service';
export {
	computeUrgency,
	urgencyBadgeClasses,
	type UrgencyLevel,
	type UrgencyResult
} from './services/urgency';
export {
	ProjectTaskService,
	type TaskCreateInput,
	type TaskUpdateInput,
	type TaskDependencyInput
} from './services/task-service';
export { ProjectNotificationService } from './services/notification-service';
export {
	ProjectAutoAssignService,
	type AutoAssignInput,
	type AutoAssignResult
} from './services/auto-assign';
export {
	ProjectCalendarIntegrationService,
	type CalendarProvider,
	type ConnectStatus
} from './services/calendar-integration';
export {
	generateProjectPlan,
	type GeneratedPlan,
	type GeneratePlanInput
} from './capabilities/generate-plan';
export {
	summarizeDashboard,
	type DashboardSummary,
	type SummarizeDashboardInput
} from './capabilities/summarize-dashboard';
export {
	answerProjectQuestion,
	type ProjectAnswer,
	type AnswerQuestionInput
} from './capabilities/answer-question';
export {
	extractTasksFromText,
	type ExtractedTaskBundle,
	type ExtractTasksInput
} from './capabilities/extract-tasks';
export {
	draftMeetingAgenda,
	type MeetingAgenda,
	type DraftAgendaInput
} from './capabilities/meeting-agenda';
export {
	processMeetingTranscript,
	type MeetingNotes,
	type ProcessMeetingNotesInput
} from './capabilities/meeting-notes';
export { projectActions };
export {
	projectAgentManifest,
	classifyProjectIntent,
	resolveCapabilityForIntent,
	PROJECT_AGENT_ID,
	projectAgentAllowedCapabilities,
	findProjectCapabilityPolicy,
	type ProjectAgentManifest,
	type ProjectIntent,
	type ProjectIntentResult,
	type ProjectCapabilityPolicyEntry
} from './agent';
export type { ProjectInboundContract, ProjectPublicGroup } from './integrations/contracts';
export { PROJECT_PUBLIC_GROUPS } from './integrations/contracts';
export { projectAppSurface };
export { projectCapabilities, projectCapabilityIds };
export { projectWorkflows, projectWorkflowIds };
export { projectModule, projectManifestV2 };
