import { z } from 'zod';
import type { ModuleContext } from '$platform/modules/types';
import { ProjectTaskRepository, QmsRecordRepository } from '../repositories';
import { ProjectTaskService } from './task-service';
import { computeUrgency, type UrgencyResult } from './urgency';

/**
 * Project Task Calendar — a time-based EXECUTION view.
 *
 * Design boundary (see ref_files/v4 Calendar design doc):
 *   - Gantt is the planning source of truth (it owns task create/edit/CPM).
 *   - Calendar only PROJECTS existing `projectTasks` onto a day/week/month
 *     timeline as virtual `CalendarTaskEvent` DTOs — it never owns a separate
 *     "calendar task" truth table and never persists events.
 *   - WorkPlace owns personal task detail + submission.
 *
 * Events are derived on read from project tasks (+ optional schedule / QMS
 * overlays). Reschedules go back through `ProjectTaskService.update` (exposed as
 * `updateTask` on the api), which logs the schedule-change + audit — the
 * Calendar never mutates a task date directly.
 */

const CALENDAR_QUICK_FILTERS = [
	'overdue',
	'under_review',
	'blocked',
	'milestones',
	'critical_path',
	'conflict',
	'qms_pending'
] as const;
export type CalendarQuickFilter = (typeof CALENDAR_QUICK_FILTERS)[number];

/** Single Zod source of truth shared by the api method + the view-calendar
 * capability (Architecture_rules R4). */
export const CalendarEventsInputSchema = z.object({
	fromIso: z.string().describe('Window start, inclusive (YYYY-MM-DD).'),
	toIso: z.string().describe('Window end, inclusive (YYYY-MM-DD).'),
	mine: z.boolean().optional().describe('Only tasks assigned to the current user.'),
	projectId: z.string().optional(),
	assigneeId: z.string().optional(),
	stageId: z.string().optional(),
	status: z
		.enum(['unassigned', 'ongoing', 'under_review', 'completed', 'blocked'])
		.optional(),
	taskType: z.string().optional(),
	quick: z.enum(CALENDAR_QUICK_FILTERS).optional(),
	/** Skip the per-project CPM + QMS overlays (cheaper). Default: include. */
	includeOverlays: z.boolean().optional()
});
export type CalendarEventsInput = z.infer<typeof CalendarEventsInputSchema>;

export type CalendarEventType = 'task_start' | 'task_due';
export type CalendarBadge =
	| 'overdue'
	| 'blocked'
	| 'under_review'
	| 'milestone'
	| 'critical_path'
	| 'conflict'
	| 'qms_pending'
	| 'outsourced';

export interface CalendarTaskEvent {
	/** Unique per (task, event-type) so a task with both a start and a due date
	 * inside the window yields two distinct, stably-keyed cells. */
	id: string;
	taskId: string;
	projectId: string;
	projectName: string | null;
	stageId: string | null;
	stageName: string | null;
	stageColor: string | null;
	title: string;
	assigneeId: string | null;
	assigneeName: string | null;
	status: string;
	type: CalendarEventType;
	/** The day this event sits on (YYYY-MM-DD). */
	date: string;
	/** Human meaning of `date` for the card. */
	dateMeaning: 'starts' | 'due' | 'overdue';
	taskType: string | null;
	kind: string;
	isMilestone: boolean;
	progressPct: number | null;
	badges: CalendarBadge[];
	urgency: UrgencyResult;
}

export class ProjectCalendarService {
	private taskRepo: ProjectTaskRepository;
	private recordRepo: QmsRecordRepository;
	private taskService: ProjectTaskService;

	constructor(private ctx: ModuleContext) {
		this.taskRepo = new ProjectTaskRepository(ctx.db);
		this.recordRepo = new QmsRecordRepository(ctx.db);
		this.taskService = new ProjectTaskService(ctx);
	}

	/**
	 * Build the execution-calendar event list for the window. Reads project
	 * tasks (optionally scoped to one assignee) and derives one event per
	 * in-window start/due date, decorated with risk badges. Critical-path,
	 * conflict and QMS-pending badges come from optional per-project overlays.
	 */
	async getCalendarEvents(input: CalendarEventsInput): Promise<CalendarTaskEvent[]> {
		const { fromIso, toIso } = input;
		const todayIso = new Date().toISOString().slice(0, 10);
		const now = new Date();

		// Lazy, no-cron status refresh (same trigger model as `list()`): bring
		// blocked / ongoing up to date for every project touching the window so
		// the badges are honest. Bounded to the in-window projects.
		const windowProjectIds = await this.taskRepo.projectIdsWithTasksInWindow({ fromIso, toIso });
		for (const pid of windowProjectIds) {
			await this.taskService.recomputeDerivedStatus(pid);
		}

		const assigneeId = input.mine ? this.ctx.user?.id ?? '__none__' : input.assigneeId;
		const rows = await this.taskRepo.calendarTasksForWindow({ fromIso, toIso, assigneeId });

		// Pre-filter by simple task attributes before deriving events.
		const filtered = rows.filter((t) => {
			if (input.projectId && t.projectId !== input.projectId) return false;
			if (input.stageId && t.workflowStageId !== input.stageId) return false;
			if (input.status && t.status !== input.status) return false;
			if (input.taskType && t.taskType !== input.taskType) return false;
			return true;
		});

		// Overlays: critical path + conflicts (per project CPM) and QMS pending.
		const includeOverlays = input.includeOverlays !== false;
		const criticalSet = new Set<string>();
		const conflictSet = new Set<string>();
		const qmsPendingSet = new Set<string>();
		if (includeOverlays) {
			const projectIds = [...new Set(filtered.map((t) => t.projectId))];
			for (const pid of projectIds) {
				const sched = await this.taskService.schedule(pid);
				for (const id of sched.criticalPath) criticalSet.add(id);
				for (const c of sched.conflicts) {
					if (c.type === 'dependency') {
						conflictSet.add(c.fromTaskId);
						conflictSet.add(c.toTaskId);
					} else {
						for (const id of c.taskIds) conflictSet.add(id);
					}
				}
				const records = await this.recordRepo.listForProject(pid);
				for (const r of records) {
					if (r.isRequired && r.status !== 'approved' && r.status !== 'waived' && r.taskId) {
						qmsPendingSet.add(r.taskId);
					}
				}
			}
		}

		const events: CalendarTaskEvent[] = [];
		for (const t of filtered) {
			const isMilestone = t.kind === 'milestone' || t.isMilestone;
			const isOverdue =
				!!t.endDate && t.endDate < todayIso && t.status !== 'completed';

			const baseBadges: CalendarBadge[] = [];
			if (isOverdue) baseBadges.push('overdue');
			if (t.status === 'blocked') baseBadges.push('blocked');
			if (t.status === 'under_review') baseBadges.push('under_review');
			if (isMilestone) baseBadges.push('milestone');
			if (criticalSet.has(t.id)) baseBadges.push('critical_path');
			if (conflictSet.has(t.id)) baseBadges.push('conflict');
			if (qmsPendingSet.has(t.id)) baseBadges.push('qms_pending');
			if (t.outsourcedPartnerId) baseBadges.push('outsourced');

			const urgency = computeUrgency({
				status: t.status,
				startDate: t.startDate,
				deadline: t.endDate,
				now
			});

			const common = {
				taskId: t.id,
				projectId: t.projectId,
				projectName: t.projectName,
				stageId: t.workflowStageId,
				stageName: t.stageName,
				stageColor: t.stageColor,
				title: t.name,
				assigneeId: t.assigneeId,
				assigneeName: t.assigneeName ?? t.assigneeEmail ?? null,
				status: t.status,
				taskType: t.taskType,
				kind: t.kind,
				isMilestone,
				progressPct: t.progressPct,
				badges: baseBadges,
				urgency
			};

			if (t.startDate && t.startDate >= fromIso && t.startDate <= toIso) {
				events.push({
					...common,
					id: `${t.id}:task_start`,
					type: 'task_start',
					date: t.startDate,
					dateMeaning: 'starts'
				});
			}
			if (t.endDate && t.endDate >= fromIso && t.endDate <= toIso) {
				events.push({
					...common,
					id: `${t.id}:task_due`,
					type: 'task_due',
					date: t.endDate,
					dateMeaning: isOverdue ? 'overdue' : 'due'
				});
			}
		}

		// Apply quick filters last so they act on the derived badges/types.
		const quick = input.quick;
		const result = quick
			? events.filter((e) => {
					switch (quick) {
						case 'overdue':
							return e.badges.includes('overdue');
						case 'under_review':
							return e.status === 'under_review';
						case 'blocked':
							return e.status === 'blocked';
						case 'milestones':
							return e.isMilestone;
						case 'critical_path':
							return e.badges.includes('critical_path');
						case 'conflict':
							return e.badges.includes('conflict');
						case 'qms_pending':
							return e.badges.includes('qms_pending');
						default:
							return true;
					}
				})
			: events;

		return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
	}
}
