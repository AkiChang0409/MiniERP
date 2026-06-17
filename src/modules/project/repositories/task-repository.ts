import { and, asc, desc, eq, isNull, inArray, lt, gte, lte, or, sql } from 'drizzle-orm';
import type { DBClient } from '$infrastructure/db';
import {
	projects,
	projectTasks,
	projectTaskDependencies,
	projectWorkflowStages,
	projectCalendarIntegrations,
	projectTaskScheduleChanges,
	projectNotifications
} from './project.schema';
import { users } from '$platform/auth/users.schema';
import { BaseRepository } from '$platform/modules/base-repository';

/**
 * Phase 1B / Epic 2 — task layer for the Gantt chart.
 *
 * Reads return the assignee join so the UI can render "Alice" instead of
 * "u_4Qg…". The repo stays narrow — calculations like critical path live in
 * the service.
 */
export class ProjectTaskRepository extends BaseRepository<typeof projectTasks> {
	constructor(db: DBClient) {
		super(db, projectTasks);
	}

	async listForProject(projectId: string) {
		return this.db
			.select({
				id: projectTasks.id,
				projectId: projectTasks.projectId,
				parentTaskId: projectTasks.parentTaskId,
				name: projectTasks.name,
				description: projectTasks.description,
				status: projectTasks.status,
				startDate: projectTasks.startDate,
				endDate: projectTasks.endDate,
				assigneeId: projectTasks.assigneeId,
				estimatedHours: projectTasks.estimatedHours,
				orderIndex: projectTasks.orderIndex,
				completedAt: projectTasks.completedAt,
				isMilestone: projectTasks.isMilestone,
				workflowStageId: projectTasks.workflowStageId,
				// Gantt optimization P0
				kind: projectTasks.kind,
				baselineStart: projectTasks.baselineStart,
				baselineEnd: projectTasks.baselineEnd,
				actualStart: projectTasks.actualStart,
				progressPct: projectTasks.progressPct,
				bufferDays: projectTasks.bufferDays,
				blockedReason: projectTasks.blockedReason,
				outsourcedPartnerId: projectTasks.outsourcedPartnerId,
				subProjectId: projectTasks.subProjectId,
				taskType: projectTasks.taskType,
				createdAt: projectTasks.createdAt,
				updatedAt: projectTasks.updatedAt,
				assigneeName: users.name,
				assigneeEmail: users.email
			})
			.from(projectTasks)
			.leftJoin(users, eq(projectTasks.assigneeId, users.id))
			.where(and(eq(projectTasks.projectId, projectId), isNull(projectTasks.deletedAt)))
			.orderBy(asc(projectTasks.orderIndex), asc(projectTasks.startDate));
	}

	async findInProject(projectId: string, taskId: string) {
		const rows = await this.db
			.select()
			.from(projectTasks)
			.where(
				and(
					eq(projectTasks.id, taskId),
					eq(projectTasks.projectId, projectId),
					isNull(projectTasks.deletedAt)
				)
			)
			.limit(1);
		return rows[0] ?? null;
	}

	/** Counts task statuses for the portfolio bar's completion %. */
	async statusCountsForProjects(projectIds: string[]) {
		if (projectIds.length === 0) return [] as Array<{ projectId: string; status: string; n: number }>;
		const rows = await this.db
			.select({
				projectId: projectTasks.projectId,
				status: projectTasks.status,
				n: sql<number>`count(*)`
			})
			.from(projectTasks)
			.where(and(inArray(projectTasks.projectId, projectIds), isNull(projectTasks.deletedAt)))
			.groupBy(projectTasks.projectId, projectTasks.status);
		return rows.map((r) => ({ projectId: r.projectId, status: r.status, n: Number(r.n ?? 0) }));
	}

	/** Tasks in a given status with project + assignee context — powers the
	 * manager/owner review workspace (status='under_review'). */
	async listByStatusWithContext(status: string) {
		return this.db
			.select({
				id: projectTasks.id,
				projectId: projectTasks.projectId,
				projectName: projects.name,
				projectOwnerId: projects.ownerId,
				name: projectTasks.name,
				description: projectTasks.description,
				status: projectTasks.status,
				startDate: projectTasks.startDate,
				endDate: projectTasks.endDate,
				taskType: projectTasks.taskType,
				submissionNote: projectTasks.submissionNote,
				assigneeId: projectTasks.assigneeId,
				assigneeName: users.name,
				assigneeEmail: users.email
			})
			.from(projectTasks)
			.leftJoin(projects, eq(projectTasks.projectId, projects.id))
			.leftJoin(users, eq(projectTasks.assigneeId, users.id))
			// `status` is a free string at the call site; the column is an enum.
			.where(and(eq(projectTasks.status, status as never), isNull(projectTasks.deletedAt)))
			.orderBy(asc(projectTasks.endDate));
	}

	/** Tasks assigned to a user with project name + description — powers the
	 * personal Workplace ("My Space") view. */
	async assignedToUserWithProject(userId: string) {
		return this.db
			.select({
				id: projectTasks.id,
				projectId: projectTasks.projectId,
				projectName: projects.name,
				name: projectTasks.name,
				description: projectTasks.description,
				status: projectTasks.status,
				startDate: projectTasks.startDate,
				endDate: projectTasks.endDate,
				taskType: projectTasks.taskType
			})
			.from(projectTasks)
			.leftJoin(projects, eq(projectTasks.projectId, projects.id))
			.where(and(eq(projectTasks.assigneeId, userId), isNull(projectTasks.deletedAt)))
			.orderBy(asc(projectTasks.endDate));
	}

	/** Used by the workload balancer (Epic 4). */
	async tasksAssignedTo(userId: string, opts?: { onlyActive?: boolean }) {
		const conds = [eq(projectTasks.assigneeId, userId), isNull(projectTasks.deletedAt)];
		if (opts?.onlyActive) {
			conds.push(sql`${projectTasks.status} != 'completed'`);
		}
		return this.db
			.select({
				id: projectTasks.id,
				projectId: projectTasks.projectId,
				name: projectTasks.name,
				status: projectTasks.status,
				startDate: projectTasks.startDate,
				endDate: projectTasks.endDate,
				estimatedHours: projectTasks.estimatedHours
			})
			.from(projectTasks)
			.where(and(...conds))
			.orderBy(asc(projectTasks.endDate));
	}

	/** Overdue, still-open tasks assigned to a user — drives overdue notifications. */
	async overdueAssignedTo(userId: string, todayIso: string) {
		return this.db
			.select({
				id: projectTasks.id,
				projectId: projectTasks.projectId,
				name: projectTasks.name,
				status: projectTasks.status,
				endDate: projectTasks.endDate
			})
			.from(projectTasks)
			.where(
				and(
					eq(projectTasks.assigneeId, userId),
					isNull(projectTasks.deletedAt),
					lt(projectTasks.endDate, todayIso),
					sql`${projectTasks.status} not in ('completed')`
				)
			);
	}

	/** Tasks whose deadline falls inside the calendar window. */
	async tasksForWindow(opts: { fromIso: string; toIso: string }) {
		return this.db
			.select({
				id: projectTasks.id,
				projectId: projectTasks.projectId,
				name: projectTasks.name,
				status: projectTasks.status,
				endDate: projectTasks.endDate,
				startDate: projectTasks.startDate
			})
			.from(projectTasks)
			.where(
				and(
					isNull(projectTasks.deletedAt),
					or(
						and(
							gte(projectTasks.endDate, opts.fromIso),
							lte(projectTasks.endDate, opts.toIso)
						),
						and(
							gte(projectTasks.startDate, opts.fromIso),
							lte(projectTasks.startDate, opts.toIso)
						)
					)!
				)
			);
	}
}

export class ProjectTaskDependencyRepository extends BaseRepository<typeof projectTaskDependencies> {
	constructor(db: DBClient) {
		super(db, projectTaskDependencies);
	}

	async listForProject(projectId: string) {
		return this.db
			.select()
			.from(projectTaskDependencies)
			.where(
				and(
					eq(projectTaskDependencies.projectId, projectId),
					isNull(projectTaskDependencies.deletedAt)
				)
			);
	}
}

export class ProjectWorkflowStageRepository extends BaseRepository<typeof projectWorkflowStages> {
	constructor(db: DBClient) {
		super(db, projectWorkflowStages);
	}

	async listForProject(projectId: string) {
		return this.db
			.select()
			.from(projectWorkflowStages)
			.where(
				and(
					eq(projectWorkflowStages.projectId, projectId),
					isNull(projectWorkflowStages.deletedAt)
				)
			)
			.orderBy(asc(projectWorkflowStages.orderIndex));
	}

	async findInProject(projectId: string, stageId: string) {
		const rows = await this.db
			.select()
			.from(projectWorkflowStages)
			.where(
				and(
					eq(projectWorkflowStages.id, stageId),
					eq(projectWorkflowStages.projectId, projectId),
					isNull(projectWorkflowStages.deletedAt)
				)
			)
			.limit(1);
		return rows[0] ?? null;
	}
}

export class ProjectCalendarIntegrationRepository extends BaseRepository<
	typeof projectCalendarIntegrations
> {
	constructor(db: DBClient) {
		super(db, projectCalendarIntegrations);
	}

	async listForUser(userId: string) {
		return this.db
			.select()
			.from(projectCalendarIntegrations)
			.where(
				and(
					eq(projectCalendarIntegrations.userId, userId),
					isNull(projectCalendarIntegrations.deletedAt)
				)
			);
	}

	async findActive(userId: string, provider: 'google' | 'outlook') {
		const rows = await this.db
			.select()
			.from(projectCalendarIntegrations)
			.where(
				and(
					eq(projectCalendarIntegrations.userId, userId),
					eq(projectCalendarIntegrations.provider, provider),
					eq(projectCalendarIntegrations.status, 'active'),
					isNull(projectCalendarIntegrations.deletedAt)
				)
			)
			.limit(1);
		return rows[0] ?? null;
	}
}

// ---------------------------------------------------------------------------
// Portfolio Gantt feed helper — joins projects with derived task counts so we
// don't make N+1 queries from the route.
// ---------------------------------------------------------------------------

export class ProjectGanttPortfolioRepository {
	constructor(private db: DBClient) {}

	async portfolio(opts: { fromIso?: string; toIso?: string; ownerId?: string }) {
		const conds = [isNull(projects.deletedAt)];
		if (opts.ownerId) conds.push(eq(projects.ownerId, opts.ownerId));
		if (opts.fromIso) conds.push(gte(projects.deadline, opts.fromIso));
		if (opts.toIso) {
			// "starts before window-end OR has no startDate" gives the user every
			// project whose bar would be visible in the chosen range.
			conds.push(
				or(
					isNull(projects.startDate),
					lte(projects.startDate, opts.toIso),
					lt(projects.startDate, opts.toIso)
				)!
			);
		}

		const rows = await this.db
			.select({
				id: projects.id,
				name: projects.name,
				status: projects.status,
				startDate: projects.startDate,
				endDate: projects.endDate,
				deadline: projects.deadline,
				createdAt: projects.createdAt,
				ownerId: projects.ownerId,
				ownerName: users.name,
				ownerEmail: users.email
			})
			.from(projects)
			.leftJoin(users, eq(projects.ownerId, users.id))
			.where(and(...conds))
			.orderBy(asc(projects.startDate), asc(projects.deadline));

		return rows;
	}
}

// ---------------------------------------------------------------------------
// Schedule changes (P3 — delay/reschedule audit log)
// ---------------------------------------------------------------------------

export class ProjectScheduleChangeRepository extends BaseRepository<
	typeof projectTaskScheduleChanges
> {
	constructor(db: DBClient) {
		super(db, projectTaskScheduleChanges);
	}

	async listForTask(taskId: string) {
		return this.db
			.select()
			.from(projectTaskScheduleChanges)
			.where(
				and(
					eq(projectTaskScheduleChanges.taskId, taskId),
					isNull(projectTaskScheduleChanges.deletedAt)
				)
			)
			.orderBy(desc(projectTaskScheduleChanges.createdAt));
	}
}

// ---------------------------------------------------------------------------
// Notifications (P3 — in-app feed)
// ---------------------------------------------------------------------------

export class ProjectNotificationRepository extends BaseRepository<typeof projectNotifications> {
	constructor(db: DBClient) {
		super(db, projectNotifications);
	}

	async listForUser(userId: string, opts?: { unreadOnly?: boolean; limit?: number }) {
		const conds = [
			eq(projectNotifications.recipientId, userId),
			isNull(projectNotifications.deletedAt)
		];
		if (opts?.unreadOnly) conds.push(eq(projectNotifications.isRead, false));
		return this.db
			.select()
			.from(projectNotifications)
			.where(and(...conds))
			.orderBy(desc(projectNotifications.createdAt))
			.limit(opts?.limit ?? 50);
	}

	async unreadCount(userId: string): Promise<number> {
		const [row] = await this.db
			.select({ n: sql<number>`count(*)` })
			.from(projectNotifications)
			.where(
				and(
					eq(projectNotifications.recipientId, userId),
					eq(projectNotifications.isRead, false),
					isNull(projectNotifications.deletedAt)
				)
			);
		return Number(row?.n ?? 0);
	}

	async findByDedupe(recipientId: string, dedupeKey: string) {
		const rows = await this.db
			.select()
			.from(projectNotifications)
			.where(
				and(
					eq(projectNotifications.recipientId, recipientId),
					eq(projectNotifications.dedupeKey, dedupeKey)
				)
			)
			.limit(1);
		return rows[0] ?? null;
	}

	async markRead(id: string, userId: string) {
		await this.db
			.update(projectNotifications)
			.set({ isRead: true, updatedAt: new Date().toISOString() })
			.where(
				and(eq(projectNotifications.id, id), eq(projectNotifications.recipientId, userId))
			);
	}

	async markAllRead(userId: string) {
		await this.db
			.update(projectNotifications)
			.set({ isRead: true, updatedAt: new Date().toISOString() })
			.where(
				and(
					eq(projectNotifications.recipientId, userId),
					eq(projectNotifications.isRead, false)
				)
			);
	}
}
