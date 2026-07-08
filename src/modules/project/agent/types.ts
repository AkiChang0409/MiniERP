export type ProjectIntent =
	| 'generate_plan'
	| 'summarize_dashboard'
	| 'answer_project_question'
	| 'extract_tasks'
	| 'draft_meeting_agenda'
	| 'process_meeting_notes'
	| 'view_calendar'
	// Stage-2 draft intents (R3): produce a reviewable change-set proposal that
	// the orchestrator stages for confirmation before any write.
	| 'propose_task_plan'
	| 'propose_reschedule'
	| 'propose_assignment'
	| 'unknown';

export type ProjectOwnedDomain =
	| 'project'
	| 'task'
	| 'project_member'
	| 'project_plan'
	| 'meeting'
	| 'project_dashboard'
	| 'project_document';

export type ProjectForbiddenAction =
	| 'delete_project'
	| 'modify_finance_record'
	| 'modify_employee_master_data'
	| 'change_permission'
	| 'bypass_validation';

export type ProjectRiskLevel = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5';

export interface ProjectIntentResult {
	intent: ProjectIntent;
	confidence: number;
	reason: string;
	requiredInputs: string[];
	/** The single-step capability this intent dispatches to (project has no
	 *  multi-step workflows yet), or null when the intent is unknown. */
	suggestedCapabilityId: string | null;
	riskLevel: ProjectRiskLevel;
}
