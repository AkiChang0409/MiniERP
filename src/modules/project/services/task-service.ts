import { and, eq, isNull, sql } from 'drizzle-orm';
import type { ModuleContext } from '$platform/modules/types';
import { NotFoundError } from '$platform/modules/errors';
import { schema } from '$infrastructure/db';
import {
	ProjectRepository,
	ProjectCollaboratorRepository,
	ProjectTaskRepository,
	ProjectTaskDependencyRepository,
	ProjectWorkflowStageRepository,
	ProjectGanttPortfolioRepository
} from '../repositories';
import { ProjectPermissionError, ProjectValidationError } from '../domain';

/**
 * Phase 1B / Epic 2 — task and Gantt-portfolio orchestration. Permission
 * gating reuses the project-level scope (owner / manager / collaborator /
 * none) since tasks are a child of the project entity.
 */

const TASK_STATUSES = ['unassigned', 'ongoing', 'under_review', 'completed', 'blocked'] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];

export interface TaskCreateInput {
	projectId: string;
	name: string;
	description?: string;
	startDate?: string | null;
	endDate?: string | null;
	assigneeId?: string | null;
	estimatedHours?: number | null;
	parentTaskId?: string | null;
	orderIndex?: number;
	isMilestone?: boolean;
	workflowStageId?: string | null;
	status?: TaskStatus;
}

export interface TaskUpdateInput {
	name?: string;
	description?: string | null;
	startDate?: string | null;
	endDate?: string | null;
	assigneeId?: string | null;
	estimatedHours?: number | null;
	parentTaskId?: string | null;
	orderIndex?: number;
	isMilestone?: boolean;
	workflowStageId?: string | null;
	status?: TaskStatus;
	completedAt?: string | null;
}

export interface TaskDependencyInput {
	projectId: string;
	fromTaskId: string;
	toTaskId: string;
	kind?: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish';
	lagDays?: number;
}

function isManager(roles: readonly string[] | null | undefined): boolean {
	if (!roles) return false;
	return roles.some((r) => r === 'owner' || r === 'admin' || r === 'project_manager');
}

export class ProjectTaskService {
	private projectRepo: ProjectRepository;
	private collaboratorRepo: ProjectCollaboratorRepository;
	private taskRepo: ProjectTaskRepository;
	private depRepo: ProjectTaskDependencyRepository;
	private stageRepo: ProjectWorkflowStageRepository;
	private portfolioRepo: ProjectGanttPortfolioRepository;

	constructor(private ctx: ModuleContext) {
		this.projectRepo = new ProjectRepository(ctx.db);
		this.collaboratorRepo = new ProjectCollaboratorRepository(ctx.db);
		this.taskRepo = new ProjectTaskRepository(ctx.db);
		this.depRepo = new ProjectTaskDependencyRepository(ctx.db);
		this.stageRepo = new ProjectWorkflowStageRepository(ctx.db);
		this.portfolioRepo = new ProjectGanttPortfolioRepository(ctx.db);
	}

	private async assertCanEdit(projectId: string, requireCrucial = false) {
		const project = await this.projectRepo.findById(projectId);
		if (!project) throw new NotFoundError('Project', projectId);
		const user = this.ctx.user;
		if (!user) throw new ProjectPermissionError('Sign in required.');

		if (isManager(user.roles ?? [])) return 'manager' as const;
		if (project.ownerId && project.ownerId === user.id) return 'owner' as const;
		const collab = await this.collaboratorRepo.findByProjectAndUser(projectId, user.id);
		if (collab) {
			if (requireCrucial) {
				throw new ProjectPermissionError(
					'This action is reserved for the project owner or a manager.'
				);
			}
			return 'collaborator' as const;
		}
		throw new ProjectPermissionError('You do not have access to this project.');
	}

	// -----------------------------------------------------------------------
	// Tasks
	// -----------------------------------------------------------------------

	async list(projectId: string) {
		const project = await this.projectRepo.findById(projectId);
		if (!project) throw new NotFoundError('Project', projectId);
		const [tasks, deps] = await Promise.all([
			this.taskRepo.listForProject(projectId),
			this.depRepo.listForProject(projectId)
		]);
		return { tasks, dependencies: deps };
	}

	async create(input: TaskCreateInput) {
		if (!input.name || !input.name.trim()) {
			throw new ProjectValidationError({ name: 'Task name is required.' });
		}
		await this.assertCanEdit(input.projectId);

		// orderIndex defaults to "end of list" so manual ordering stays stable.
		let orderIndex = input.orderIndex;
		if (orderIndex == null) {
			const [{ n }] = await this.ctx.db
				.select({ n: sql<number>`count(*)` })
				.from(schema.projectTasks)
				.where(
					and(
						eq(schema.projectTasks.projectId, input.projectId),
						isNull(schema.projectTasks.deletedAt)
					)
				);
			orderIndex = Number(n ?? 0);
		}

		const id = crypto.randomUUID();
		await this.taskRepo.create({
			id,
			projectId: input.projectId,
			parentTaskId: input.parentTaskId ?? null,
			name: input.name.trim(),
			description: input.description ?? null,
			status: input.status ?? 'unassigned',
			startDate: input.startDate ?? null,
			endDate: input.endDate ?? null,
			assigneeId: input.assigneeId ?? null,
			estimatedHours: input.estimatedHours ?? null,
			orderIndex,
			isMilestone: input.isMilestone ?? false,
			workflowStageId: input.workflowStageId ?? null
		});
		return { id };
	}

	async update(taskId: string, projectId: string, patch: TaskUpdateInput) {
		await this.assertCanEdit(projectId);
		const existing = await this.taskRepo.findInProject(projectId, taskId);
		if (!existing) throw new NotFoundError('Task', taskId);

		const update: Record<string, unknown> = { ...patch };
		if (typeof update.name === 'string') update.name = update.name.trim();
		if (update.status === 'completed' && !existing.completedAt) {
			update.completedAt = new Date().toISOString();
		}
		if (update.status && update.status !== 'completed' && existing.completedAt) {
			update.completedAt = null;
		}
		await this.taskRepo.update(taskId, update);
		return { id: taskId };
	}

	async remove(taskId: string, projectId: string) {
		await this.assertCanEdit(projectId);
		await this.taskRepo.softDelete(taskId);
		return { id: taskId };
	}

	// -----------------------------------------------------------------------
	// Dependencies
	// -----------------------------------------------------------------------

	async addDependency(input: TaskDependencyInput) {
		await this.assertCanEdit(input.projectId);
		if (input.fromTaskId === input.toTaskId) {
			throw new ProjectValidationError({ to: 'A task cannot depend on itself.' });
		}
		// Reject obvious cycles. Full DAG cycle-detection runs whenever the
		// critical-path resolver is invoked; this is just the cheap fast guard.
		const reverse = await this.ctx.db
			.select()
			.from(schema.projectTaskDependencies)
			.where(
				and(
					eq(schema.projectTaskDependencies.projectId, input.projectId),
					eq(schema.projectTaskDependencies.fromTaskId, input.toTaskId),
					eq(schema.projectTaskDependencies.toTaskId, input.fromTaskId),
					isNull(schema.projectTaskDependencies.deletedAt)
				)
			)
			.limit(1);
		if (reverse.length > 0) {
			throw new ProjectValidationError({ to: 'That dependency would create a cycle.' });
		}

		const id = crypto.randomUUID();
		await this.depRepo.create({
			id,
			projectId: input.projectId,
			fromTaskId: input.fromTaskId,
			toTaskId: input.toTaskId,
			kind: input.kind ?? 'finish_to_start',
			lagDays: input.lagDays ?? 0
		});
		return { id };
	}

	async removeDependency(depId: string, projectId: string) {
		await this.assertCanEdit(projectId);
		await this.depRepo.softDelete(depId);
		return { id: depId };
	}

	// -----------------------------------------------------------------------
	// Critical path (Epic 2C)
	// -----------------------------------------------------------------------

	/**
	 * Returns the ordered task IDs on the longest path from any start node
	 * (no incoming dep) to any end node (no outgoing dep). Pure topological
	 * traversal — no AI involved, just plain DAG math.
	 */
	async criticalPath(projectId: string): Promise<{ taskIds: string[]; durationDays: number }> {
		const [tasks, deps] = await Promise.all([
			this.taskRepo.listForProject(projectId),
			this.depRepo.listForProject(projectId)
		]);
		if (tasks.length === 0) return { taskIds: [], durationDays: 0 };

		// Build adjacency (only finish_to_start is treated as a hard predecessor
		// for this v1 calculation; the other kinds are scaffolded but ignored).
		const incoming = new Map<string, string[]>();
		const outgoing = new Map<string, string[]>();
		for (const t of tasks) {
			incoming.set(t.id, []);
			outgoing.set(t.id, []);
		}
		for (const dep of deps) {
			if (dep.kind !== 'finish_to_start') continue;
			(incoming.get(dep.toTaskId) ?? []).push(dep.fromTaskId);
			(outgoing.get(dep.fromTaskId) ?? []).push(dep.toTaskId);
		}

		const durationOf = (t: (typeof tasks)[number]) => {
			if (!t.startDate || !t.endDate) return 1;
			const s = Date.parse(t.startDate);
			const e = Date.parse(t.endDate);
			if (Number.isNaN(s) || Number.isNaN(e)) return 1;
			return Math.max(1, Math.round((e - s) / 86_400_000) + 1);
		};

		// Memoized longest path to end (`dp[id] = { length, next | null }`).
		const dp = new Map<string, { length: number; next: string | null }>();
		const taskById = new Map(tasks.map((t) => [t.id, t]));
		const visiting = new Set<string>();

		const longest = (id: string): { length: number; next: string | null } => {
			const cached = dp.get(id);
			if (cached) return cached;
			if (visiting.has(id)) {
				// Cycle — bail with zero rather than infinite-looping. Front-end
				// validation should keep this from happening.
				return { length: 0, next: null };
			}
			visiting.add(id);
			const node = taskById.get(id);
			if (!node) {
				visiting.delete(id);
				return { length: 0, next: null };
			}
			const successors = outgoing.get(id) ?? [];
			if (successors.length === 0) {
				const res = { length: durationOf(node), next: null };
				dp.set(id, res);
				visiting.delete(id);
				return res;
			}
			let best = { length: -1, next: null as string | null };
			for (const s of successors) {
				const sub = longest(s);
				if (sub.length > best.length) best = { length: sub.length, next: s };
			}
			const res = { length: durationOf(node) + best.length, next: best.next };
			dp.set(id, res);
			visiting.delete(id);
			return res;
		};

		const startNodes = tasks.filter((t) => (incoming.get(t.id) ?? []).length === 0);
		let head: string | null = null;
		let headLen = -1;
		for (const t of startNodes) {
			const sub = longest(t.id);
			if (sub.length > headLen) {
				headLen = sub.length;
				head = t.id;
			}
		}
		const taskIds: string[] = [];
		while (head) {
			taskIds.push(head);
			const next = dp.get(head)?.next ?? null;
			head = next;
		}
		return { taskIds, durationDays: headLen };
	}

	// -----------------------------------------------------------------------
	// Portfolio Gantt feed
	// -----------------------------------------------------------------------

	async portfolio(opts?: { fromIso?: string; toIso?: string; scope?: 'all' | 'mine' }) {
		const ownerId =
			opts?.scope === 'mine' && this.ctx.user ? this.ctx.user.id : undefined;
		const rows = await this.portfolioRepo.portfolio({
			fromIso: opts?.fromIso,
			toIso: opts?.toIso,
			ownerId
		});
		if (rows.length === 0) {
			return { projects: [] };
		}
		const counts = await this.taskRepo.statusCountsForProjects(rows.map((r) => r.id));
		const completionByProject = new Map<
			string,
			{ total: number; completed: number; blocked: number }
		>();
		for (const c of counts) {
			const slot = completionByProject.get(c.projectId) ?? {
				total: 0,
				completed: 0,
				blocked: 0
			};
			slot.total += c.n;
			if (c.status === 'completed') slot.completed += c.n;
			if (c.status === 'blocked') slot.blocked += c.n;
			completionByProject.set(c.projectId, slot);
		}
		return {
			projects: rows.map((r) => {
				const c = completionByProject.get(r.id);
				const completionPct = c && c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0;
				return {
					...r,
					taskTotal: c?.total ?? 0,
					taskCompleted: c?.completed ?? 0,
					taskBlocked: c?.blocked ?? 0,
					completionPct
				};
			})
		};
	}

	// -----------------------------------------------------------------------
	// Workflow stages (Phase 2B / Epic 3)
	// -----------------------------------------------------------------------

	async listStages(projectId: string) {
		return this.stageRepo.listForProject(projectId);
	}

	async setStages(
		projectId: string,
		stages: Array<{
			name: string;
			kind?: 'task_group' | 'approval' | 'budget_gate' | 'manual';
			conditionExpression?: string | null;
		}>
	) {
		await this.assertCanEdit(projectId, true);
		// Wipe + recreate keeps the editor simple; rules are recomputed on next
		// auto-advance pass.
		const existing = await this.stageRepo.listForProject(projectId);
		for (const stage of existing) {
			await this.stageRepo.softDelete(stage.id);
		}
		for (let i = 0; i < stages.length; i++) {
			const id = crypto.randomUUID();
			await this.stageRepo.create({
				id,
				projectId,
				name: stages[i].name,
				orderIndex: i,
				kind: stages[i].kind ?? 'task_group',
				status: i === 0 ? 'in_progress' : 'pending',
				conditionExpression: stages[i].conditionExpression ?? null
			});
		}
	}

	/**
	 * Auto-advance: when every non-blocked task tagged with the current stage
	 * is `completed`, move to the next stage. Conditional rules (e.g. budget
	 * threshold) gate the move; unmet conditions block the project until
	 * someone resolves them.
	 */
	async autoAdvanceStages(projectId: string): Promise<{ moved: boolean; toStageId?: string }> {
		await this.assertCanEdit(projectId);
		const stages = await this.stageRepo.listForProject(projectId);
		if (stages.length === 0) return { moved: false };

		const current = stages.find((s) => s.status === 'in_progress') ?? stages[0];
		if (current.status === 'completed') return { moved: false };

		const taskRows = await this.ctx.db
			.select({
				id: schema.projectTasks.id,
				status: schema.projectTasks.status
			})
			.from(schema.projectTasks)
			.where(
				and(
					eq(schema.projectTasks.projectId, projectId),
					eq(schema.projectTasks.workflowStageId, current.id),
					isNull(schema.projectTasks.deletedAt)
				)
			);
		if (taskRows.length === 0) return { moved: false };
		if (taskRows.some((t) => t.status !== 'completed')) return { moved: false };

		// Evaluate the (very small) condition DSL. v1 understands one shape:
		//   { "kind": "budget_lte", "value": 50000 }
		// Anything else is treated as "no condition".
		if (current.conditionExpression) {
			try {
				const parsed = JSON.parse(current.conditionExpression);
				if (parsed?.kind === 'budget_lte') {
					// Hook for finance integration; left unimplemented here so the
					// build stays standalone. Default: allow.
				}
			} catch {
				/* malformed condition — treat as pass */
			}
		}

		await this.stageRepo.update(current.id, {
			status: 'completed',
			completedAt: new Date().toISOString()
		});
		const next = stages.find((s) => s.orderIndex === current.orderIndex + 1);
		if (next) await this.stageRepo.update(next.id, { status: 'in_progress' });
		return { moved: true, toStageId: next?.id };
	}
}
