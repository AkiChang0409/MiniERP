import type { ProjectForbiddenAction, ProjectIntent, ProjectOwnedDomain } from './types';

/**
 * Project Agent manifest. Mirrors the Finance Agent shape (the v5 reference).
 * The Project Agent is a *domain expert*, not an orchestrator: it answers
 * "how is a project-domain request handled here". Cross-domain routing and the
 * global tool catalog live in the platform layer (see `1_项目与架构.md §3.1`).
 *
 * Scope is intentionally the suggestive AI helpers the module already ships:
 * planning, dashboard summaries, project Q&A, document task extraction, and
 * meeting agenda/notes. Writes (create project, add member, create tasks) stay
 * on the deterministic SDK-for-code path (`createProjectApi`) behind explicit
 * user actions — they are out of the agent's tool scope on purpose.
 */
export interface ProjectAgentManifest {
	id: 'project-agent';
	name: 'Project Agent';
	domain: 'project';
	version: string;
	description: string;
	owns: readonly ProjectOwnedDomain[];
	canHandle: readonly ProjectIntent[];
	cannotHandle: readonly string[];
	defaultRiskLevel: 'R1';
	forbiddenActions: readonly ProjectForbiddenAction[];
}

export const projectAgentManifest: ProjectAgentManifest = {
	id: 'project-agent',
	name: 'Project Agent',
	domain: 'project',
	version: '0.1.0',
	description:
		'Domain-bounded agent for project delivery: generate a draft plan, summarise portfolio health, answer questions about a project, extract tasks from documents, draft meeting agendas/notes, and read the task execution calendar. Suggestive / read-only — never persists.',
	owns: [
		'project',
		'task',
		'project_member',
		'project_plan',
		'meeting',
		'project_dashboard',
		'project_document'
	],
	canHandle: [
		'generate_plan',
		'summarize_dashboard',
		'answer_project_question',
		'extract_tasks',
		'draft_meeting_agenda',
		'process_meeting_notes',
		'view_calendar'
	],
	cannotHandle: [
		'delete_project',
		'create_project',
		'modify_project_master_data',
		'manage_user_permissions',
		'modify_financial_record',
		'modify_employee_master_data',
		'read_unrelated_tenant_data'
	],
	defaultRiskLevel: 'R1',
	forbiddenActions: [
		'delete_project',
		'modify_finance_record',
		'modify_employee_master_data',
		'change_permission',
		'bypass_validation'
	]
};
