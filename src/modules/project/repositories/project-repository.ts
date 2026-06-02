import { eq, isNull, and, like, or, desc, asc, sql, lt, lte, gte, inArray } from 'drizzle-orm';
import type { DBClient } from '$infrastructure/db';
import {
	projects,
	projectEmployees,
	projectCollaborators,
	projectComments
} from './project.schema';
import { businessPartners } from '$modules/sales-crm/repositories/customer.schema';
import { users } from '$platform/auth/users.schema';
import { BaseRepository } from '$platform/modules/base-repository';

// ---------------------------------------------------------------------------
// ProjectRepository
// ---------------------------------------------------------------------------

export class ProjectRepository extends BaseRepository<typeof projects> {
	constructor(db: DBClient) {
		super(db, projects);
	}

	async findWithCustomer(projectId: string) {
		const rows = await this.db
			.select({
				project: projects,
				customerName: businessPartners.name,
				ownerEmail: users.email,
				ownerName: users.name
			})
			.from(projects)
			.leftJoin(businessPartners, eq(projects.businessPartnerId, businessPartners.id))
			.leftJoin(users, eq(projects.ownerId, users.id))
			.where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
			.limit(1);
		return rows[0] ?? null;
	}

	async list(opts?: {
		q?: string;
		status?: string;
		page?: number;
		pageSize?: number;
		ownerId?: string;
		participantUserId?: string;
	}) {
		const page = opts?.page ?? 1;
		const pageSize = opts?.pageSize ?? 20;
		const conditions = [isNull(projects.deletedAt)];

		if (opts?.q) {
			conditions.push(
				or(
					like(projects.name, `%${opts.q}%`),
					like(projects.description, `%${opts.q}%`)
				)!
			);
		}
		if (opts?.status) {
			conditions.push(eq(projects.status, opts.status));
		}
		if (opts?.ownerId) {
			conditions.push(eq(projects.ownerId, opts.ownerId));
		}
		if (opts?.participantUserId) {
			// owned OR collaborator on (TKMGMT3 "projects they own or collaborate on")
			const collabSubquery = this.db
				.select({ id: projectCollaborators.projectId })
				.from(projectCollaborators)
				.where(
					and(
						eq(projectCollaborators.userId, opts.participantUserId),
						isNull(projectCollaborators.deletedAt)
					)
				);
			conditions.push(
				or(eq(projects.ownerId, opts.participantUserId), inArray(projects.id, collabSubquery))!
			);
		}

		const where = and(...conditions);

		const rows = await this.db
			.select({
				project: projects,
				customerName: businessPartners.name,
				ownerEmail: users.email,
				ownerName: users.name
			})
			.from(projects)
			.leftJoin(businessPartners, eq(projects.businessPartnerId, businessPartners.id))
			.leftJoin(users, eq(projects.ownerId, users.id))
			.where(where)
			.orderBy(desc(projects.createdAt))
			.limit(pageSize)
			.offset((page - 1) * pageSize);

		return rows;
	}

	async getListCounts() {
		const [[allProjectsCountRow], [activeProjectsCountRow]] = await Promise.all([
			this.db.select({ n: sql<number>`count(*)` }).from(projects).where(isNull(projects.deletedAt)),
			this.db
				.select({ n: sql<number>`count(*)` })
				.from(projects)
				.where(and(isNull(projects.deletedAt), eq(projects.status, 'active')))
		]);

		return {
			all: Number(allProjectsCountRow?.n ?? 0),
			active: Number(activeProjectsCountRow?.n ?? 0)
		};
	}

	async getMembers(projectId: string) {
		return this.db
			.select()
			.from(projectEmployees)
			.where(
				and(eq(projectEmployees.projectId, projectId), isNull(projectEmployees.deletedAt))
			);
	}

	// -------------------------------------------------------------------------
	// TKMGMT3 / TKMGMT8 / TKMGMT10 — calendar / dashboard queries
	// -------------------------------------------------------------------------

	/** Status summary counts for the dashboard pie/bar chart. */
	async getStatusSummary() {
		const rows = await this.db
			.select({
				status: projects.status,
				n: sql<number>`count(*)`
			})
			.from(projects)
			.where(isNull(projects.deletedAt))
			.groupBy(projects.status);
		return rows.map((r) => ({ status: r.status, count: Number(r.n ?? 0) }));
	}

	/** Next N projects whose deadline falls inside the lookahead window. */
	async getUpcomingDeadlines(opts: { fromIso: string; toIso: string; limit?: number }) {
		const limit = opts.limit ?? 5;
		return this.db
			.select({
				id: projects.id,
				name: projects.name,
				status: projects.status,
				deadline: projects.deadline,
				priority: projects.priority,
				ownerEmail: users.email,
				ownerName: users.name
			})
			.from(projects)
			.leftJoin(users, eq(projects.ownerId, users.id))
			.where(
				and(
					isNull(projects.deletedAt),
					gte(projects.deadline, opts.fromIso),
					lte(projects.deadline, opts.toIso)
				)
			)
			.orderBy(asc(projects.deadline))
			.limit(limit);
	}

	/** Projects past deadline that are not yet completed. */
	async getOverdue(opts: { nowIso: string; limit?: number }) {
		return this.db
			.select({
				id: projects.id,
				name: projects.name,
				status: projects.status,
				deadline: projects.deadline,
				priority: projects.priority,
				ownerEmail: users.email,
				ownerName: users.name
			})
			.from(projects)
			.leftJoin(users, eq(projects.ownerId, users.id))
			.where(
				and(
					isNull(projects.deletedAt),
					lt(projects.deadline, opts.nowIso),
					sql`${projects.status} != 'completed'`
				)
			)
			.orderBy(asc(projects.deadline))
			.limit(opts.limit ?? 50);
	}

	/** Calendar feed: projects with a deadline inside the window. */
	async getCalendarEntries(opts: { fromIso: string; toIso: string }) {
		return this.db
			.select({
				id: projects.id,
				name: projects.name,
				status: projects.status,
				deadline: projects.deadline,
				priority: projects.priority,
				recurrenceFrequency: projects.recurrenceFrequency,
				recurrenceInterval: projects.recurrenceInterval,
				recurrenceParentId: projects.recurrenceParentId
			})
			.from(projects)
			.where(
				and(
					isNull(projects.deletedAt),
					gte(projects.deadline, opts.fromIso),
					lte(projects.deadline, opts.toIso)
				)
			)
			.orderBy(asc(projects.deadline));
	}

	/** Direct sub-projects (TKMGMT1) for a given parent. */
	async getSubProjects(parentProjectId: string) {
		return this.db
			.select()
			.from(projects)
			.where(
				and(eq(projects.parentProjectId, parentProjectId), isNull(projects.deletedAt))
			)
			.orderBy(asc(projects.createdAt));
	}
}

// ---------------------------------------------------------------------------
// ProjectMemberRepository
// ---------------------------------------------------------------------------

export class ProjectMemberRepository extends BaseRepository<typeof projectEmployees> {
	constructor(db: DBClient) {
		super(db, projectEmployees);
	}

	async findByProjectAndPerson(projectId: string, personId: string) {
		const rows = await this.db
			.select()
			.from(projectEmployees)
			.where(
				and(
					eq(projectEmployees.projectId, projectId),
					eq(projectEmployees.personId, personId),
					isNull(projectEmployees.deletedAt)
				)
			)
			.limit(1);
		return rows[0] ?? null;
	}
}

// ---------------------------------------------------------------------------
// ProjectCollaboratorRepository (TKMGMT1 / TKMGMT2 / TKMGMT3 / TKMGMT9)
// ---------------------------------------------------------------------------

export class ProjectCollaboratorRepository extends BaseRepository<typeof projectCollaborators> {
	constructor(db: DBClient) {
		super(db, projectCollaborators);
	}

	async listForProject(projectId: string) {
		return this.db
			.select({
				id: projectCollaborators.id,
				projectId: projectCollaborators.projectId,
				userId: projectCollaborators.userId,
				role: projectCollaborators.role,
				email: users.email,
				name: users.name,
				createdAt: projectCollaborators.createdAt
			})
			.from(projectCollaborators)
			.innerJoin(users, eq(projectCollaborators.userId, users.id))
			.where(
				and(
					eq(projectCollaborators.projectId, projectId),
					isNull(projectCollaborators.deletedAt)
				)
			)
			.orderBy(asc(projectCollaborators.createdAt));
	}

	async findByProjectAndUser(projectId: string, userId: string) {
		const rows = await this.db
			.select()
			.from(projectCollaborators)
			.where(
				and(
					eq(projectCollaborators.projectId, projectId),
					eq(projectCollaborators.userId, userId),
					isNull(projectCollaborators.deletedAt)
				)
			)
			.limit(1);
		return rows[0] ?? null;
	}

	async removeByProjectAndUser(projectId: string, userId: string) {
		const existing = await this.findByProjectAndUser(projectId, userId);
		if (!existing) return false;
		await this.softDelete(existing.id);
		return true;
	}
}

// ---------------------------------------------------------------------------
// ProjectCommentRepository (TKMGMT9)
// ---------------------------------------------------------------------------

export class ProjectCommentRepository extends BaseRepository<typeof projectComments> {
	constructor(db: DBClient) {
		super(db, projectComments);
	}

	async listForProject(projectId: string, opts?: { limit?: number }) {
		const rows = await this.db
			.select()
			.from(projectComments)
			.where(
				and(eq(projectComments.projectId, projectId), isNull(projectComments.deletedAt))
			)
			.orderBy(desc(projectComments.createdAt))
			.limit(opts?.limit ?? 100);
		return rows;
	}
}

// ---------------------------------------------------------------------------
// Helper: look up users by email (used to resolve @mentions and to invite
// collaborators by email). Lives here because the project module is the only
// caller and we want to keep the boundary linter happy.
// ---------------------------------------------------------------------------

export class ProjectUserDirectory {
	constructor(private db: DBClient) {}

	async findByEmail(email: string) {
		const rows = await this.db
			.select({ id: users.id, email: users.email, name: users.name })
			.from(users)
			.where(eq(users.email, email))
			.limit(1);
		return rows[0] ?? null;
	}

	async findByIds(ids: string[]) {
		if (ids.length === 0) return [];
		return this.db
			.select({ id: users.id, email: users.email, name: users.name })
			.from(users)
			.where(inArray(users.id, ids));
	}

	async findByEmailPrefix(prefix: string, limit = 8) {
		return this.db
			.select({ id: users.id, email: users.email, name: users.name })
			.from(users)
			.where(or(like(users.email, `${prefix}%`), like(users.name, `${prefix}%`))!)
			.limit(limit);
	}

	async listAll(limit = 50) {
		return this.db
			.select({ id: users.id, email: users.email, name: users.name })
			.from(users)
			.orderBy(asc(users.email))
			.limit(limit);
	}
}
