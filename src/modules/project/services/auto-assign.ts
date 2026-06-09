import type { ModuleContext } from '$platform/modules/types';
import {
	ProjectCollaboratorRepository,
	ProjectRepository,
	ProjectTaskRepository
} from '../repositories';

/**
 * Phase 3 / Epic 4 — auto-assign + auto-prioritize.
 *
 * v1 is heuristic-only (no LLM) for two reasons:
 *   1. It runs on every "assign" click — needs to be cheap and predictable.
 *   2. The math is simple: spread load across people whose calendars are
 *      least busy in the task's date window, biased away from anyone already
 *      over-allocated.
 *
 * Inputs the caller supplies:
 *   - the project (to enumerate collaborator candidates)
 *   - the new task's start/end dates and estimated hours
 *
 * Output:
 *   - { assigneeId, rationale } | { assigneeId: null, rationale }
 *
 * Out-of-scope additions like "skill match" can come later by joining a
 * tags table; the signature already returns rationale so a richer model
 * can drop in without changing call sites.
 */

const WORK_DAY_HOURS = 8;

interface CandidateLoad {
	userId: string;
	name: string;
	email: string;
	committedHoursInWindow: number;
	overlappingTaskCount: number;
}

export interface AutoAssignInput {
	projectId: string;
	startDate?: string | null;
	endDate?: string | null;
	estimatedHours?: number | null;
	requestedRole?: string | null;
}

export interface AutoAssignResult {
	assigneeId: string | null;
	rationale: string;
	candidates: CandidateLoad[];
}

export class ProjectAutoAssignService {
	private projectRepo: ProjectRepository;
	private collaboratorRepo: ProjectCollaboratorRepository;
	private taskRepo: ProjectTaskRepository;

	constructor(private ctx: ModuleContext) {
		this.projectRepo = new ProjectRepository(ctx.db);
		this.collaboratorRepo = new ProjectCollaboratorRepository(ctx.db);
		this.taskRepo = new ProjectTaskRepository(ctx.db);
	}

	async pickAssignee(input: AutoAssignInput): Promise<AutoAssignResult> {
		const project = await this.projectRepo.findById(input.projectId);
		if (!project) {
			return { assigneeId: null, rationale: 'Project not found.', candidates: [] };
		}

		// Eligible pool: owner + every collaborator. The owner is always in
		// the candidate pool even if they aren't an explicit collaborator.
		const collaborators = await this.collaboratorRepo.listForProject(input.projectId);
		const pool = new Map<string, { id: string; email: string; name: string }>();
		for (const c of collaborators) {
			pool.set(c.userId, { id: c.userId, email: c.email, name: c.name });
		}
		if (project.ownerId && !pool.has(project.ownerId)) {
			// We don't have owner name/email easily here; collaboratorRepo will
			// have surfaced them if the owner was also added as collaborator.
			// In the common case ownership without collab is rare; skip enriching.
			pool.set(project.ownerId, { id: project.ownerId, email: '', name: '' });
		}

		if (pool.size === 0) {
			return {
				assigneeId: null,
				rationale: 'No collaborators yet — add at least one before auto-assign.',
				candidates: []
			};
		}

		// Score each candidate by current committed hours that overlap the
		// new task's window. The lower the load, the better the fit.
		const candidates: CandidateLoad[] = [];
		const windowStart = input.startDate ? Date.parse(input.startDate) : null;
		const windowEnd = input.endDate ? Date.parse(input.endDate) : null;

		for (const [userId, info] of pool) {
			const tasks = await this.taskRepo.tasksAssignedTo(userId, { onlyActive: true });
			let committedHours = 0;
			let overlap = 0;
			for (const t of tasks) {
				if (!t.startDate || !t.endDate) continue;
				const ts = Date.parse(t.startDate);
				const te = Date.parse(t.endDate);
				if (Number.isNaN(ts) || Number.isNaN(te)) continue;
				const overlapsWindow =
					windowStart != null && windowEnd != null
						? ts <= windowEnd && te >= windowStart
						: true;
				if (!overlapsWindow) continue;
				overlap += 1;
				const hours =
					t.estimatedHours ??
					Math.max(1, Math.round((te - ts) / 86_400_000)) * WORK_DAY_HOURS;
				committedHours += hours;
			}
			candidates.push({
				userId,
				name: info.name || info.email || userId,
				email: info.email,
				committedHoursInWindow: committedHours,
				overlappingTaskCount: overlap
			});
		}

		candidates.sort((a, b) => {
			if (a.committedHoursInWindow !== b.committedHoursInWindow) {
				return a.committedHoursInWindow - b.committedHoursInWindow;
			}
			return a.overlappingTaskCount - b.overlappingTaskCount;
		});

		const winner = candidates[0];
		if (!winner) {
			return { assigneeId: null, rationale: 'No suitable candidate.', candidates: [] };
		}

		// Over-allocation guard — 60h committed in the window is the soft cap;
		// over it, we still return the lightest candidate but flag the load.
		const overAllocated = winner.committedHoursInWindow > 60;
		const rationale = overAllocated
			? `Lowest-load collaborator (${winner.name}) is already heavily booked (${winner.committedHoursInWindow}h). Consider reassigning later.`
			: `${winner.name} has the lowest load in this window (${winner.committedHoursInWindow}h).`;

		return { assigneeId: winner.userId, rationale, candidates };
	}
}
