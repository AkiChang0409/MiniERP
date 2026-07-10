import { describe, it, expect } from 'vitest';
import type { ModuleContext } from '$platform/modules/types';
import { createProjectApi } from '../../services/api';
import { computeNextDeadline } from '../../domain';

/**
 * Guards the project module's SDK-for-code contract after the v5 service split:
 *  1. `createProjectApi(ctx)` assembles the exact flat method surface that
 *     routes / other modules consume — no method dropped or renamed by the
 *     per-use-case decomposition.
 *  2. the recurrence domain rule keeps its deadline math.
 *
 * The service constructors only stash `ctx.db` into repositories (no query at
 * construction), so a stub context is enough to assemble + introspect the API.
 */

const EXPECTED_METHODS = [
	// reads
	'getById',
	'getWithCustomer',
	'list',
	'getProjectListPage',
	'getListCounts',
	'getProjectShell',
	'getSubProjects',
	// lifecycle
	'create',
	'update',
	'archive',
	'softDelete',
	'completeAndMaybeRecur',
	// members
	'getMembers',
	'addMember',
	'removeMember',
	// collaborators
	'listCollaborators',
	'addCollaborator',
	'addCollaboratorByEmail',
	'removeCollaborator',
	// comments
	'listComments',
	'addComment',
	// attachments
	'listAttachments',
	'addAttachment',
	'removeAttachment',
	'clearLegacyAttachment',
	// permissions
	'getEditableScope',
	// dashboard / calendar
	'getDashboard',
	'getCalendarEntries',
	// financials
	'getProjectFinancials',
	// directory
	'searchUsers',
	'listUsers',
	// tasks / Gantt (ProjectTaskService — renamed to avoid project-level collisions)
	'listTasks',
	'createTask',
	'updateTask',
	'removeTask',
	'getTaskBitableRecordId',
	'setTaskBitableRecordId',
	'listTaskHistory',
	'addTaskDependency',
	'removeTaskDependency',
	'getTaskSchedule',
	'getCriticalPath',
	'getGanttPortfolio',
	'listStages',
	'setStages',
	'advanceStages',
	// QMS templates
	'listQmsTemplates',
	'createQmsTemplate',
	'updateQmsTemplate',
	'archiveQmsTemplate',
	// QMS records
	'suggestQmsForTask',
	'listTaskRecords',
	'listProjectRecords',
	'attachRecordsToTask',
	'updateRecord',
	'submitRecord',
	'approveRecord',
	'rejectRecord',
	'waiveRecord',
	// QMS-driven task workflow (workplace / review)
	'getWorkplace',
	'listReviewQueue',
	'approveTask',
	'rejectTask',
	'getTaskDetail',
	'assigneeSubmitTask',
	// notifications
	'listNotifications',
	'markNotificationRead',
	'markAllNotificationsRead',
	// task execution calendar
	'getCalendarEvents'
] as const;

describe('project api contract', () => {
	const api = createProjectApi({ db: {} } as unknown as ModuleContext);

	it('exposes exactly the expected public method surface', () => {
		expect(Object.keys(api).sort()).toEqual([...EXPECTED_METHODS].sort());
	});

	it('every exposed member is a callable function', () => {
		for (const name of EXPECTED_METHODS) {
			expect(typeof (api as Record<string, unknown>)[name], `${name} not a function`).toBe(
				'function'
			);
		}
	});
});

describe('project recurrence rule', () => {
	it('shifts the deadline per frequency', () => {
		expect(computeNextDeadline('2026-06-12', 'daily')).toBe('2026-06-13');
		expect(computeNextDeadline('2026-06-12', 'weekly')).toBe('2026-06-19');
		expect(computeNextDeadline('2026-06-12', 'monthly')).toBe('2026-07-12');
		expect(computeNextDeadline('2026-06-12', 'custom', 10)).toBe('2026-06-22');
	});
});
