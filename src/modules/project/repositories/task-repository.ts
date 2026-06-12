import { and, asc, desc, eq, isNull, inArray, lt, gte, lte, or, sql } from 'drizzle-orm';
import type { DBClient } from '$infrastructure/db';
import {
	projects,
	projectTasks,
	projectTaskDependencies,
	projectWorkflowStages,
	projectCalendarIntegrations
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
