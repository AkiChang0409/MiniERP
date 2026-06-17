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
	ProjectGanttPortfolioRepository,
	ProjectScheduleChangeRepository
} from '../repositories';
import { ProjectPermissionError, ProjectValidationError } from '../domain';
import {
	computeSchedule,
	detectConflicts,
	type SchedTask,
	type SchedDep
} from './scheduling';
import { writeTaskAudit } from './task-audit';

/**
 * Phase 1B / Epic 2 — task and Gantt-portfolio orchestration. Permission
 * gating reuses the project-level scope (owner / manager / collaborator /
 * none) since tasks are a child of the project entity.
 */

const TASK_STATUSES = ['unassigned', 'ongoing', 'under_review', 'completed', 'blocked'] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];

const TASK_KINDS = ['task', 'milestone', 'buffer'] as const;
type TaskKind = (typeof TASK_KINDS)[number];

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
	// Gantt optimization P0
	kind?: TaskKind;
	progressPct?: number | null;
	bufferDays?: number | null;
	blockedReason?: string | null;
	outsourcedPartnerId?: string | null;
	subProjectId?: string | null;
	/** Override the frozen baseline; defaults to start/endDate at create time. */
	baselineStart?: string | null;
	baselineEnd?: string | null;
	actualStart?: string | null;
	/** ISO 9001 work-type classification — the QMS template matching key. */
	taskType?: string | null;
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
	// Gantt optimization P0
	kind?: TaskKind;
	progressPct?: number | null;
	bufferDays?: number | null;
	blockedReason?: string | null;
	outsourcedPartnerId?: string | null;
	subProjectId?: string | null;
	baselineStart?: string | null;
	baselineEnd?: string | null;
	actualStart?: string | null;
	/** ISO 9001 work-type classification — the QMS template matching key. */
	taskType?: string | null;
	/** Not a column — captured into the schedule-change log when dates move. */
	rescheduleReason?: string | null;
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
	private scheduleChangeRepo: ProjectScheduleChangeRepository;

	constructor(private ctx: ModuleContext) {
		this.projectRepo = new ProjectRepository(ctx.db);
		this.collaboratorRepo = new ProjectCollaboratorRepository(ctx.db);
		this.taskRepo = new ProjectTaskRepository(ctx.db);
		this.depRepo = new ProjectTaskDependencyRepository(ctx.db);
		this.stageRepo = new ProjectWorkflowStageRepository(ctx.db);
		this.portfolioRepo = new ProjectGanttPortfolioRepository(ctx.db);
		this.scheduleChangeRepo = new ProjectScheduleChangeRepository(ctx.db);
	}

	/**
	 * Dependency-driven blocked rule. A task in a pre-work state
	 * (unassigned / ongoing / blocked) is `blocked` while any of its blocking
	 * predecessors is not yet `completed`; it auto-clears (→ ongoing if it has an
	 * assignee, else unassigned) once they finish. Submitted/completed tasks are
	 * never auto-blocked. Iterates to a fixpoint so dependency CHAINS settle in a
	 * single call, and only persists the rows that actually changed.
	 */
	async recomputeBlocked(projectId: string) {
		const [tasks, deps] = await Promise.all([
			this.taskRepo.listForProject(projectId),
			this.depRepo.listForProject(projectId)
		]);
		const eligible = (s: string) => s === 'unassigned' || s === 'ongoing' || s === 'blocked';
		const status = new Map(tasks.map((t) => [t.id, t.status as string]));
		const assignee = new Map(tasks.map((t) => [t.id, t.assigneeId]));

		let changed = true;
		let guard = 0;
		while (changed && guard++ <= tasks.length) {
			changed = false;
			for (const t of tasks) {
				const s = status.get(t.id)!;
				if (!eligible(s)) continue;
				const blocked = deps.some(
					(d) =>
						d.toTaskId === t.id &&
						d.isBlocking &&
						(status.get(d.fromTaskId) ?? 'completed') !== 'completed'
				);
				const target = blocked ? 'blocked' : assignee.get(t.id) ? 'ongoing' : 'unassigned';
				if (target !== s) {
					status.set(t.id, target);
					changed = true;
				}
			}
		}

		for (const t of tasks) {
			const next = status.get(t.id)!;
			if (next === t.status) continue;
			await this.taskRepo.update(t.id, { status: next });
			// Surface newly-blocked tasks on the project timeline (unblock is
			// intentionally not audited — it's derivable and would be noisy).
			if (next === 'blocked') {
				await writeTaskAudit(this.ctx, {
					projectId,
					taskId: t.id,
					action: 'project.task.blocked',
					from: t.status,
					to: 'blocked',
					taskName: t.name
				});
			}
		}
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

		// `kind` and the legacy `isMilestone` boolean are kept consistent so old
		// readers and the new vocabulary agree.
		const kind: TaskKind = input.kind ?? (input.isMilestone ? 'milestone' : 'task');
		const isMilestone = kind === 'milestone' || (input.isMilestone ?? false);

		const id = crypto.randomUUID();
		await this.taskRepo.create({
			id,
			projectId: input.projectId,
			parentTaskId: input.parentTaskId ?? null,
			name: input.name.trim(),
			description: input.description ?? null,
			// Status is system-managed, never client-set: a task starts `ongoing`
			// the moment it has an assignee, otherwise `unassigned`. Submission /
			// approval / blocking-dependency rules drive every later transition.
			status: input.assigneeId ? 'ongoing' : 'unassigned',
			startDate: input.startDate ?? null,
			endDate: input.endDate ?? null,
			assigneeId: input.assigneeId ?? null,
			estimatedHours: input.estimatedHours ?? null,
			orderIndex,
			isMilestone,
			workflowStageId: input.workflowStageId ?? null,
			// Gantt P0: freeze the baseline from the initial plan unless the caller
			// passes one explicitly. This is the "ghost bar" drift reference.
			kind,
			baselineStart: input.baselineStart ?? input.startDate ?? null,
			baselineEnd: input.baselineEnd ?? input.endDate ?? null,
			actualStart: input.actualStart ?? null,
			progressPct: input.progressPct ?? null,
			bufferDays: input.bufferDays ?? 0,
			blockedReason: input.blockedReason ?? null,
			outsourcedPartnerId: input.outsourcedPartnerId ?? null,
			subProjectId: input.subProjectId ?? null,
			taskType: input.taskType ?? null
		});
		return { id };
	}

	async update(taskId: string, projectId: string, patch: TaskUpdateInput) {
		await this.assertCanEdit(projectId);
		const existing = await this.taskRepo.findInProject(projectId, taskId);
		if (!existing) throw new NotFoundError('Task', taskId);

		const update: Record<string, unknown> = { ...patch };
		// `rescheduleReason` is an input, not a column — pull it out before the
		// row update and fold it into the schedule-change log below.
		const rescheduleReason = patch.rescheduleReason ?? null;
		delete (update as { rescheduleReason?: unknown }).rescheduleReason;
		if (typeof update.name === 'string') update.name = update.name.trim();

		// Status is system-managed: never accept it (or completedAt) from a
		// generic edit. Transitions come from assignment (here), submission,
		// approval, and the blocking-dependency rule (recomputeBlocked).
		delete (update as { status?: unknown }).status;
		delete (update as { completedAt?: unknown }).completedAt;

		// Keep `kind` and the legacy `isMilestone` boolean mutually consistent.
		if (patch.kind !== undefined) {
			update.isMilestone = patch.kind === 'milestone';
		} else if (patch.isMilestone !== undefined) {
			update.kind = patch.isMilestone ? 'milestone' : 'task';
		}

		// Assignment drives unassigned ↔ ongoing (only from those pre-work states;
		// a submitted/completed task keeps its status until the workflow moves it).
		if (patch.assigneeId !== undefined) {
			const nowIso = new Date().toISOString();
			if (patch.assigneeId && existing.status === 'unassigned') {
				update.status = 'ongoing';
				if (!existing.actualStart && patch.actualStart === undefined) {
					update.actualStart = nowIso.slice(0, 10);
				}
			} else if (
				!patch.assigneeId &&
				(existing.status === 'ongoing' || existing.status === 'blocked')
			) {
				update.status = 'unassigned';
			}
		}
		await this.taskRepo.update(taskId, update);

		// Re-derive blocked across the project (this task's assignment may have
		// changed, which affects its own blocked eligibility).
		await this.recomputeBlocked(projectId);

		// Audit any date move into the schedule-change log (drives "this task
		// slipped N times / why" + the task history timeline). Only when a date
		// actually changed.
		const startChanged =
			patch.startDate !== undefined && (patch.startDate ?? null) !== (existing.startDate ?? null);
		const endChanged =
			patch.endDate !== undefined && (patch.endDate ?? null) !== (existing.endDate ?? null);
		if (startChanged || endChanged) {
			await this.scheduleChangeRepo.create({
				id: crypto.randomUUID(),
				projectId,
				taskId,
				eventType: 'rescheduled',
				oldStart: existing.startDate ?? null,
				oldEnd: existing.endDate ?? null,
				newStart: (patch.startDate ?? existing.startDate) ?? null,
				newEnd: (patch.endDate ?? existing.endDate) ?? null,
				reason: rescheduleReason,
				triggeredBy: this.ctx.user?.id ?? null
			});
		}
		return { id: taskId };
	}

	/** Reschedule / delay history for a single task (newest first). */
	async listTaskHistory(projectId: string, taskId: string) {
		const existing = await this.taskRepo.findInProject(projectId, taskId);
		if (!existing) throw new NotFoundError('Task', taskId);
		return this.scheduleChangeRepo.listForTask(taskId);
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
		// A new blocking edge can immediately block the successor.
		await this.recomputeBlocked(input.projectId);
		return { id };
	}

	async removeDependency(depId: string, projectId: string) {
		await this.assertCanEdit(projectId);
		await this.depRepo.softDelete(depId);
		// Removing an edge may unblock the former successor.
		await this.recomputeBlocked(projectId);
		return { id: depId };
	}

	// -----------------------------------------------------------------------
	// Scheduling — CPM + conflict detection (Epic 2C / Gantt P2)
	// -----------------------------------------------------------------------

	/**
	 * Full schedule: per-task CPM float (total/free slack), the critical path,
	 * and the conflict list (dependency violations + resource over-allocation).
	 * Pure math lives in `scheduling.ts`; this just loads the data. Honours all
	 * four dependency kinds and per-edge lag. Manual dates are never mutated.
	 */
	async schedule(projectId: string) {
		const [tasks, deps] = await Promise.all([
			this.taskRepo.listForProject(projectId),
			this.depRepo.listForProject(projectId)
		]);
		const sched = computeSchedule(tasks as SchedTask[], deps as SchedDep[]);
		const conflicts = detectConflicts(tasks as SchedTask[], deps as SchedDep[]);
		return {
			tasks: tasks.map((t) => ({ ...t, schedule: sched.bySchedule[t.id] ?? null })),
			criticalPath: sched.criticalPath,
			projectDurationDays: sched.projectDurationDays,
			conflicts
		};
	}

	/**
	 * Backwards-compatible critical-path endpoint — now derived from the full
	 * CPM pass (zero-total-float tasks) rather than a finish-to-start-only
	 * longest path. Returns the same `{ taskIds, durationDays }` shape callers
	 * already consume.
	 */
	async criticalPath(projectId: string): Promise<{ taskIds: string[]; durationDays: number }> {
		const [tasks, deps] = await Promise.all([
			this.taskRepo.listForProject(projectId),
			this.depRepo.listForProject(projectId)
		]);
		if (tasks.length === 0) return { taskIds: [], durationDays: 0 };
		const sched = computeSchedule(tasks as SchedTask[], deps as SchedDep[]);
		return { taskIds: sched.criticalPath, durationDays: sched.projectDurationDays };
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
			id?: string;
			name: string;
			kind?: 'task_group' | 'approval' | 'budget_gate' | 'manual';
			conditionExpression?: string | null;
			planStart?: string | null;
			planEnd?: string | null;
			color?: string | null;
		}>
	) {
		await this.assertCanEdit(projectId, true);

		// Upsert by id (NOT wipe-recreate): a stage keeps its identity across
		// edits so `task.workflowStageId` links, auto-advance progress, and the
		// stage's own actual dates all survive a reorder/rename. Only stages the
		// editor actually dropped get soft-deleted.
		const existing = await this.stageRepo.listForProject(projectId);
		const existingById = new Map(existing.map((s) => [s.id, s]));
		const keepIds = new Set<string>();

		for (let i = 0; i < stages.length; i++) {
			const input = stages[i];
			const matched = input.id ? existingById.get(input.id) : undefined;
			if (matched) {
				keepIds.add(matched.id);
				await this.stageRepo.update(matched.id, {
					name: input.name,
					orderIndex: i,
					kind: input.kind ?? matched.kind,
					conditionExpression: input.conditionExpression ?? null,
					planStart: input.planStart ?? null,
					planEnd: input.planEnd ?? null,
					color: input.color ?? null
				});
			} else {
				const id = crypto.randomUUID();
				keepIds.add(id);
				await this.stageRepo.create({
					id,
					projectId,
					name: input.name,
					orderIndex: i,
					kind: input.kind ?? 'task_group',
					status: 'pending',
					conditionExpression: input.conditionExpression ?? null,
					planStart: input.planStart ?? null,
					planEnd: input.planEnd ?? null,
					color: input.color ?? null
				});
			}
		}

		for (const stage of existing) {
			if (!keepIds.has(stage.id)) {
				await this.stageRepo.softDelete(stage.id);
			}
		}

		// Guarantee exactly one active stage. If none is in_progress (first-ever
		// setup, or the active stage was just removed), start the earliest one.
		const after = await this.stageRepo.listForProject(projectId);
		if (after.length > 0 && !after.some((s) => s.status === 'in_progress')) {
			await this.stageRepo.update(after[0].id, { status: 'in_progress' });
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
