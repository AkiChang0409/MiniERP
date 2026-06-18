import type { ProjectIntent, ProjectIntentResult, ProjectRiskLevel } from './types';
import { resolveCapabilityForIntent } from './workflow-binding';

export interface ClassifyProjectIntentInput {
	message?: string;
	intentHint?: ProjectIntent;
	currentPath?: string;
}

const INTENT_KEYWORDS: Array<{ intent: ProjectIntent; patterns: RegExp[] }> = [
	{
		intent: 'generate_plan',
		patterns: [
			/generate.*plan/i,
			/plan.*project/i,
			/project\s+plan/i,
			/draft.*(schedule|timeline|roadmap)/i,
			/break\s+down.*(into\s+tasks|project)/i
		]
	},
	{
		intent: 'summarize_dashboard',
		patterns: [
			/summar(y|ise|ize).*(dashboard|portfolio|projects)/i,
			/project\s+health/i,
			/how\s+are\s+(my|the)\s+projects/i,
			/overdue.*projects/i
		]
	},
	{
		intent: 'extract_tasks',
		patterns: [
			/extract.*tasks?/i,
			/tasks?\s+from.*(document|contract|doc|file)/i,
			/(action\s+items?).*(from|in).*(document|doc|contract)/i
		]
	},
	{
		intent: 'process_meeting_notes',
		patterns: [
			/meeting\s+notes/i,
			/(process|summar(y|ise|ize)).*(transcript|minutes)/i,
			/notetaker/i,
			/minutes\s+of\s+meeting|mom\b/i
		]
	},
	{
		intent: 'draft_meeting_agenda',
		patterns: [/meeting\s+agenda/i, /draft.*agenda/i, /agenda\s+for.*meeting/i]
	},
	{
		intent: 'view_calendar',
		patterns: [
			/calendar/i,
			/(this|next)\s+week.*(tasks?|due|deadlines?)/i,
			/what('s| is).*(due|overdue|happening)/i,
			/tasks?\s+(due|starting|overdue)\s+(today|this\s+week|tomorrow)/i
		]
	},
	{
		intent: 'answer_project_question',
		patterns: [/(what|who|when|why|how|where)\b/i, /question\s+about.*project/i, /ask.*project/i]
	}
];

const PATH_INTENTS: Array<{ pattern: RegExp; intent: ProjectIntent }> = [
	{ pattern: /\/projects\/?$/, intent: 'summarize_dashboard' },
	{ pattern: /\/projects\/new/, intent: 'generate_plan' },
	{ pattern: /\/projects\/[^/]+\/documents/, intent: 'extract_tasks' }
];

const INTENT_RISK: Record<ProjectIntent, ProjectRiskLevel> = {
	generate_plan: 'R1',
	summarize_dashboard: 'R0',
	answer_project_question: 'R0',
	extract_tasks: 'R1',
	draft_meeting_agenda: 'R0',
	process_meeting_notes: 'R1',
	view_calendar: 'R1',
	unknown: 'R0'
};

const INTENT_REQUIRED_INPUTS: Record<ProjectIntent, string[]> = {
	generate_plan: ['prompt'],
	summarize_dashboard: ['statusSummary'],
	answer_project_question: ['question', 'project_context'],
	extract_tasks: ['document_text'],
	draft_meeting_agenda: ['project', 'objective'],
	process_meeting_notes: ['transcript'],
	view_calendar: ['fromIso', 'toIso'],
	unknown: []
};

function build(intent: ProjectIntent, confidence: number, reason: string): ProjectIntentResult {
	const binding = resolveCapabilityForIntent(intent);
	return {
		intent,
		confidence,
		reason,
		requiredInputs: INTENT_REQUIRED_INPUTS[intent],
		suggestedCapabilityId: binding?.capabilityId ?? null,
		riskLevel: INTENT_RISK[intent]
	};
}

/**
 * Phase 1 classifier: explicit hint > keyword match > path match > unknown.
 * The free-form question intent is matched last so concrete verbs ("generate
 * a plan", "extract tasks") win over the generic interrogative pattern. The
 * LLM fallback for ambiguous messages lands in a later phase; until then,
 * unmatched messages return `unknown` so the panel can ask the user to pick a
 * project task.
 */
export function classifyProjectIntent(input: ClassifyProjectIntentInput): ProjectIntentResult {
	if (input.intentHint) {
		return build(input.intentHint, 1, 'explicit_hint');
	}

	const message = input.message?.trim();
	if (message) {
		for (const entry of INTENT_KEYWORDS) {
			if (entry.patterns.some((pattern) => pattern.test(message))) {
				return build(entry.intent, 0.85, 'keyword_match');
			}
		}
	}

	if (input.currentPath) {
		for (const entry of PATH_INTENTS) {
			if (entry.pattern.test(input.currentPath)) {
				return build(entry.intent, 0.6, 'path_match');
			}
		}
	}

	return build('unknown', 0, 'no_match');
}
