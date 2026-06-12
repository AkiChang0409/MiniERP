import type { ModuleContext } from '$platform/modules/types';
import { ProjectRepository } from '../repositories/project-repository';
import { NotFoundError } from '$platform/modules/errors';
import { createEvent } from '$platform/modules';
import { schema } from '$infrastructure/db';
import {
	ProjectPermissionError,
	computeNextDeadline,
	type RecurrenceFrequency
} from '../domain';
import { isManager } from './_internal';
import { validateRequired } from './_validation';
import type { ProjectAccessService } from './project-access-service';
import type { ProjectCollaborationService } from './project-collaboration-service';
import type { ProjectQueryService } from './project-query-service';

export interface ProjectCreateInput {
	businessPartnerId?: string | null;
	parentProjectId?: string | null;
	ownerId?: string | null;
	name: string;
	description?: string;
	notes?: string;
	status?: string;
	priority?: number;
	startDate?: string;
	endDate?: string;
	deadline?: string;
	attachmentUrl?: string | null;
	attachmentName?: string | null;
	recurrenceFrequency?: RecurrenceFrequency | null;
	recurrenceInterval?: number | null;
	collaborators?: Array<{ userId: string; role?: string | null }>;
}

export interface ProjectUpdateInput {
	name?: string;
	status?: string;
	description?: string | null;
	notes?: string | null;
	startDate?: string | null;
	endDate?: string | null;
	deadline?: string | null;
	priority?: number | null;
	attachmentUrl?: string | null;
	attachmentName?: string | null;
	recurrenceFrequency?: RecurrenceFrequency | null;
	recurrenceInterval?: number | null;
	ownerId?: string | null;
	deletedAt?: string | null;
}

/**
 * Project lifecycle — create / update / archive / soft-delete / complete +
 * recurrence (TKMGMT4 / TKMGMT6 / TKMGMT7). Permission gating reuses
 * `ProjectAccessService`; recurrence math comes from `domain/rules`.
 *
 * Future capabilities: `project.create` / `project.update` / `project.archive` /
 * `project.recur`.
 */
export class ProjectLifecycleService {
	private repo: ProjectRepository;
	private access: ProjectAccessService;
	private collaboration: ProjectCollaborationService;
	private query: ProjectQueryService;

	constructor(
		private ctx: ModuleContext,
		deps: {
			access: ProjectAccessService;
			collaboration: ProjectCollaborationService;
			query: ProjectQueryService;
		}
	) {
		this.repo = new ProjectRepository(ctx.db);
		this.access = deps.access;
		this.collaboration = deps.collaboration;
		this.query = deps.query;
	}

	async create(data: ProjectCreateInput) {
		validateRequired(data.name, data.deadline);

		const userRoles = this.ctx.user?.roles ?? [];
		const currentUserId = this.ctx.user?.id ?? null;
		// TKMGMT4 — only manager/director may explicitly assign ownership at
		// creation. Non-managers can only own their own projects.
		let ownerId = data.ownerId ?? null;
		if (ownerId && ownerId !== currentUserId && !isManager(userRoles)) {
			throw new ProjectPermissionError('Only managers may assign project ownership to others.');
		}
		if (!ownerId) ownerId = currentUserId;

		const now = new Date().toISOString();
		const projectId = crypto.randomUUID();
		const status = data.status ?? 'unassigned';

		await this.ctx.db.insert(schema.projects).values({
			id: projectId,
			businessPartnerId: data.businessPartnerId ?? null,
			ownerId,
			parentProjectId: data.parentProjectId ?? null,
			name: data.name.trim(),
			status,
			startDate: data.startDate ?? null,
			endDate: data.endDate ?? null,
			deadline: data.deadline ?? null,
			description: data.description ?? null,
			notes: data.notes ?? null,
			priority: data.priority ?? 5,
			attachmentUrl: data.attachmentUrl ?? null,
			attachmentName: data.attachmentName ?? null,
			recurrenceFrequency: data.recurrenceFrequency ?? null,
			recurrenceInterval: data.recurrenceInterval ?? null,
			createdAt: now,
			updatedAt: now
		});

		if (data.collaborators && data.collaborators.length > 0) {
			for (const c of data.collaborators) {
				await this.collaboration.addCollaborator({
					projectId,
					userId: c.userId,
					role: c.role ?? null
				});
			}
		}

		return { id: projectId };
	}

	/**
	 * Update mutates either crucial fields (name, deadline) or non-crucial
	 * fields (description, notes, status, attachments). Per TKMGMT2 crucial
	 * fields are owner-only; non-crucial fields are open to collaborators.
	 *
	 * The route layer is expected to gate writes by calling
	 * `getEditableScope(projectId)` first; this method still re-checks because
	 * the same write path is used from the API.
	 */
	async update(id: string, data: ProjectUpdateInput) {
		// Validation for required fields only when they're being set blank.
		validateRequired(
			Object.prototype.hasOwnProperty.call(data, 'name') ? (data.name ?? '') : undefined,
			Object.prototype.hasOwnProperty.call(data, 'deadline') ? data.deadline ?? '' : undefined
		);

		const existing = await this.repo.findById(id);
		if (!existing) throw new NotFoundError('Project', id);

		const scope = this.access.scopeFor(existing.ownerId);
		const touchesCrucial =
			Object.prototype.hasOwnProperty.call(data, 'name') ||
			Object.prototype.hasOwnProperty.call(data, 'deadline') ||
			Object.prototype.hasOwnProperty.call(data, 'ownerId') ||
			Object.prototype.hasOwnProperty.call(data, 'deletedAt');

		if (touchesCrucial && scope !== 'owner' && scope !== 'manager') {
			throw new ProjectPermissionError(
				'Only the project owner or a manager may edit name, deadline, or ownership.'
			);
		}
		if (!touchesCrucial && scope === 'none') {
			throw new ProjectPermissionError(
				'Only collaborators of this project may edit project details.'
			);
		}

		// TKMGMT4 — re-assignment of ownership.
		if (
			Object.prototype.hasOwnProperty.call(data, 'ownerId') &&
			data.ownerId !== existing.ownerId
		) {
			if (!isManager(this.ctx.user?.roles ?? [])) {
				throw new ProjectPermissionError(
					'Only managers/directors can transfer project ownership.'
				);
			}
		}

		const patch: Record<string, unknown> = { ...data };
		if (typeof patch.name === 'string') patch.name = patch.name.trim();
		await this.repo.update(id, patch);
	}

	async archive(id: string) {
		const updated = await this.repo.update(id, { status: 'archived' });
		await this.ctx.eventBus.emit(
			createEvent('project.archived', 'project', {
				projectId: id
			})
		);
		return updated;
	}

	async softDelete(id: string) {
		return this.repo.update(id, { status: 'archived', deletedAt: new Date().toISOString() });
	}

	/**
	 * Mark a project as completed. If the project carries a recurrence
	 * frequency, also create the next occurrence with everything (notes,
	 * collaborators, attachment) carried over and the deadline shifted.
	 *
	 * Returns the freshly-created child project id when one was generated.
	 */
	async completeAndMaybeRecur(projectId: string): Promise<{ nextProjectId: string | null }> {
		const project = await this.query.getById(projectId);
		await this.update(projectId, { status: 'completed' });

		if (!project.recurrenceFrequency) return { nextProjectId: null };
		if (!project.deadline) {
			// Cannot compute the next deadline without a current one — skip.
			return { nextProjectId: null };
		}

		const nextDeadline = computeNextDeadline(
			project.deadline,
			project.recurrenceFrequency as RecurrenceFrequency,
			project.recurrenceInterval ?? null
		);

		const nextId = crypto.randomUUID();
		const now = new Date().toISOString();
		await this.ctx.db.insert(schema.projects).values({
			id: nextId,
			businessPartnerId: project.businessPartnerId ?? null,
			ownerId: project.ownerId ?? null,
			parentProjectId: project.parentProjectId ?? null,
			name: project.name,
			status: 'unassigned',
			startDate: project.startDate ?? null,
			endDate: project.endDate ?? null,
			deadline: nextDeadline,
			description: project.description ?? null,
			notes: project.notes ?? null,
			priority: project.priority ?? 5,
			attachmentUrl: project.attachmentUrl ?? null,
			attachmentName: project.attachmentName ?? null,
			recurrenceFrequency: project.recurrenceFrequency,
			recurrenceInterval: project.recurrenceInterval ?? null,
			recurrenceParentId: project.recurrenceParentId ?? project.id,
			createdAt: now,
			updatedAt: now
		});

		// Carry collaborators forward.
		const collaborators = await this.collaboration.listCollaborators(projectId);
		for (const c of collaborators) {
			await this.collaboration.addCollaborator({
				projectId: nextId,
				userId: c.userId,
				role: c.role ?? null
			});
		}

		await this.ctx.eventBus.emit(
			createEvent('project.recurrence.spawned', 'project', {
				projectId: nextId,
				sourceProjectId: projectId
			})
		);

		return { nextProjectId: nextId };
	}
}
