import type { ProjectIntent } from './types';

/**
 * Intent → dispatch binding. Project's AI helpers are single-step capabilities
 * (plan / summary / Q&A / extraction / meeting), so each intent binds directly
 * to a `capabilityId` rather than a multi-step workflow — there are no project
 * workflows today (`workflows/index.ts` is an empty placeholder). The field is
 * named to mirror finance's `workflow-binding.ts`; when a genuine multi-step,
 * pausable/approval flow appears it can add a `workflowId` here.
 */
export interface ProjectDispatchBinding {
	capabilityId: string;
}

export const projectIntentBinding: Record<ProjectIntent, ProjectDispatchBinding | null> = {
	generate_plan: { capabilityId: 'project.generate-plan' },
	summarize_dashboard: { capabilityId: 'project.summarize-dashboard' },
	answer_project_question: { capabilityId: 'project.answer-question' },
	extract_tasks: { capabilityId: 'project.extract-tasks' },
	draft_meeting_agenda: { capabilityId: 'project.draft-meeting-agenda' },
	process_meeting_notes: { capabilityId: 'project.process-meeting-notes' },
	unknown: null
};

export function resolveCapabilityForIntent(intent: ProjectIntent): ProjectDispatchBinding | null {
	return projectIntentBinding[intent];
}
