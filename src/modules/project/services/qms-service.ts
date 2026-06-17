import type { ModuleContext } from '$platform/modules/types';
import { NotFoundError } from '$platform/modules/errors';
import {
	ProjectRepository,
	ProjectCollaboratorRepository,
	ProjectTaskRepository,
	QmsTemplateRepository,
	QmsRecordRepository
} from '../repositories';
import { ProjectPermissionError, ProjectValidationError } from '../domain';
import { ProjectTaskService } from './task-service';

/**
 * ISO 9001 QMS orchestration.
 *
 * Two layers (see design 2026-06):
 *   - Templates  : company-level master data. CRUD is manager-only.
 *   - Records    : per-task / per-project filled evidence. The record status
 *                  machine drives the task lifecycle:
 *
 *     assignee submits required records → task → under_review
 *     PM approves all required records  → task → completed
 *     PM rejects a record               → task → ongoing (assignee resubmits)
 *
 * The completion path here writes the task status DIRECTLY via the task repo,
 * bypassing `ProjectTaskService`'s completion gate — approval *is* the
 * legitimate completion route, and going through the repo avoids a recursive
 * gate ↔ approve loop.
 */

const QMS_RECORD_STATUSES = [
	'not_started',
	'draft',
	'submitted',
	'approved',
	'rejected',
	'waived'
] as const;
type QmsRecordStatus = (typeof QMS_RECORD_STATUSES)[number];

const TEMPLATE_SCOPES = ['company', 'project', 'task'] as const;
type TemplateScope = (typeof TEMPLATE_SCOPES)[number];

export interface QmsTemplateInput {
	code: string;
	name: string;
	moduleCategory?: string | null;
	scope?: TemplateScope;
	taskType?: string | null;
	responsibleRole?: string | null;
	fieldSchema?: string | null;
	fileTemplateUrl?: string | null;
	fileTemplateName?: string | null;
	requiresApproval?: boolean;
	isActive?: boolean;
	description?: string | null;
	orderIndex?: number;
}

function isManager(roles: readonly string[] | null | undefined): boolean {
	if (!roles) return false;
	return roles.some((r) => r === 'owner' || r === 'admin' || r === 'project_manager');
}

export class ProjectQmsService {
	private projectRepo: ProjectRepository;
	private collaboratorRepo: ProjectCollaboratorRepository;
	private taskRepo: ProjectTaskRepository;
	private templateRepo: QmsTemplateRepository;
	private recordRepo: QmsRecordRepository;

	constructor(private ctx: ModuleContext) {
		this.projectRepo = new ProjectRepository(ctx.db);
		this.collaboratorRepo = new ProjectCollaboratorRepository(ctx.db);
		this.taskRepo = new ProjectTaskRepository(ctx.db);
		this.templateRepo = new QmsTemplateRepository(ctx.db);
		this.recordRepo = new QmsRecordRepository(ctx.db);
	}

	// -----------------------------------------------------------------------
	// Permission helpers (mirror ProjectTaskService)
	// -----------------------------------------------------------------------

	private get user() {
		const u = this.ctx.user;
		if (!u) throw new ProjectPermissionError('Sign in required.');
		return u;
	}

	private assertManager() {
		if (!isManager(this.user.roles ?? [])) {
			throw new ProjectPermissionError('This action is reserved for a manager.');
		}
	}

	private async assertCanEdit(projectId: string, requireCrucial = false) {
		const project = await this.projectRepo.findById(projectId);
		if (!project) throw new NotFoundError('Project', projectId);
		const user = this.user;
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
	// Templates (company-level master data — manager only)
	// -----------------------------------------------------------------------

	async listTemplates(opts?: { includeInactive?: boolean }) {
		return opts?.includeInactive
			? this.templateRepo.listAll()
			: this.templateRepo.listActive();
	}

	async createTemplate(input: QmsTemplateInput) {
		this.assertManager();
		const code = input.code?.trim();
		const name = input.name?.trim();
		if (!code) throw new ProjectValidationError({ code: 'Template code is required.' });
		if (!name) throw new ProjectValidationError({ name: 'Template name is required.' });
		const dup = await this.templateRepo.findByCode(code);
		if (dup) throw new ProjectValidationError({ code: `Code "${code}" already exists.` });

		const id = crypto.randomUUID();
		await this.templateRepo.create({
			id,
			code,
			name,
			moduleCategory: input.moduleCategory ?? null,
			scope: input.scope ?? 'task',
			taskType: input.taskType ?? null,
			responsibleRole: input.responsibleRole ?? null,
			fieldSchema: input.fieldSchema ?? null,
			fileTemplateUrl: input.fileTemplateUrl ?? null,
			fileTemplateName: input.fileTemplateName ?? null,
			requiresApproval: input.requiresApproval ?? false,
			isActive: input.isActive ?? true,
			description: input.description ?? null,
			orderIndex: input.orderIndex ?? 0
		});
		return { id };
	}

	async updateTemplate(id: string, patch: Partial<QmsTemplateInput>) {
		this.assertManager();
		const existing = await this.templateRepo.findById(id);
		if (!existing) throw new NotFoundError('QmsTemplate', id);
		const update: Record<string, unknown> = { ...patch };
		if (typeof update.code === 'string') {
			const code = (update.code as string).trim();
			if (!code) throw new ProjectValidationError({ code: 'Template code is required.' });
			const dup = await this.templateRepo.findByCode(code);
			if (dup && dup.id !== id) {
				throw new ProjectValidationError({ code: `Code "${code}" already exists.` });
			}
			update.code = code;
		}
		if (typeof update.name === 'string') update.name = (update.name as string).trim();
		await this.templateRepo.update(id, update);
		return { id };
	}

	/** Retire a template (stop suggesting it) without losing historical records. */
	async archiveTemplate(id: string) {
		this.assertManager();
		const existing = await this.templateRepo.findById(id);
		if (!existing) throw new NotFoundError('QmsTemplate', id);
		await this.templateRepo.update(id, { isActive: false });
		return { id };
	}

	// -----------------------------------------------------------------------
	// Suggestions + attachment
	// -----------------------------------------------------------------------

	/**
	 * Templates the system suggests for a task, based on its `taskType`. Each is
	 * tagged with whether it's already attached so the UI can show "Add" vs
	 * "Attached".
	 */
	async suggestForTask(projectId: string, taskId: string) {
		const task = await this.taskRepo.findInProject(projectId, taskId);
		if (!task) throw new NotFoundError('Task', taskId);
		if (!task.taskType) return { taskType: null as string | null, templates: [] };
		const [templates, existing] = await Promise.all([
			this.templateRepo.suggestForTaskType(task.taskType),
			this.recordRepo.listForTask(taskId)
		]);
		const attachedTemplateIds = new Set(existing.map((r) => r.templateId));
		return {
			taskType: task.taskType,
			templates: templates.map((t) => ({ ...t, attached: attachedTemplateIds.has(t.id) }))
		};
	}

	async listRecordsForTask(projectId: string, taskId: string) {
		const task = await this.taskRepo.findInProject(projectId, taskId);
		if (!task) throw new NotFoundError('Task', taskId);
		return this.recordRepo.listForTask(taskId);
	}

	async listRecordsForProject(projectId: string) {
		return this.recordRepo.listForProject(projectId);
	}

	/** Resolve which user should fill a record from its template's role. */
	private async resolveResponsible(
		projectId: string,
		responsibleRole: string | null | undefined,
		assigneeId: string | null | undefined
	): Promise<string | null> {
		const role = (responsibleRole ?? '').trim().toLowerCase();
		if (!role || role === 'self') return assigneeId ?? null;
		const collaborators = await this.collaboratorRepo.listForProject(projectId);
		const match = collaborators.find((c) => (c.role ?? '').trim().toLowerCase() === role);
		return match?.userId ?? null;
	}

	async attachRecordsToTask(projectId: string, taskId: string, templateIds: string[]) {
		await this.assertCanEdit(projectId);
		const task = await this.taskRepo.findInProject(projectId, taskId);
		if (!task) throw new NotFoundError('Task', taskId);
		const created: string[] = [];
		for (const templateId of templateIds) {
			const template = await this.templateRepo.findById(templateId);
			if (!template) continue;
			const dup = await this.recordRepo.findForTaskAndTemplate(taskId, templateId);
			if (dup) continue;
			const responsibleUserId = await this.resolveResponsible(
				projectId,
				template.responsibleRole,
				task.assigneeId
			);
			const id = crypto.randomUUID();
			await this.recordRepo.create({
				id,
				templateId,
				projectId,
				taskId,
				code: template.code,
				name: template.name,
				status: 'not_started',
				responsibleUserId,
				responsibleRole: template.responsibleRole ?? null,
				fields: null,
				fileUrl: null,
				storageKey: null,
				fileName: null,
				version: 1,
				isRequired: true,
				requiresApproval: template.requiresApproval ?? false
			});
			created.push(id);
		}
		return { created };
	}

	async updateRecord(
		projectId: string,
		recordId: string,
		patch: {
			responsibleUserId?: string | null;
			isRequired?: boolean;
			fields?: string | null;
			fileUrl?: string | null;
			storageKey?: string | null;
			fileName?: string | null;
		}
	) {
		await this.assertCanEdit(projectId);
		const record = await this.recordRepo.findInProject(projectId, recordId);
		if (!record) throw new NotFoundError('QmsRecord', recordId);
		await this.recordRepo.update(recordId, { ...patch });
		if (patch.isRequired !== undefined && record.taskId) {
			await this.syncTaskGate(projectId, record.taskId);
		}
		return { id: recordId };
	}

	// -----------------------------------------------------------------------
	// Status transitions
	// -----------------------------------------------------------------------

	private async loadRecordOrThrow(projectId: string, recordId: string) {
		const record = await this.recordRepo.findInProject(projectId, recordId);
		if (!record) throw new NotFoundError('QmsRecord', recordId);
		return record;
	}

	/**
	 * Submit: the responsible person (or a manager/owner) marks it done.
	 * Accepts optional `fields` (the filled-in content/notes) so the responsible
	 * person can save and submit in one call — important because a pure assignee
	 * isn't necessarily a project collaborator and so can't go through the
	 * collaborator-gated `updateRecord`.
	 */
	async submitRecord(projectId: string, recordId: string, fields?: string | null) {
		const record = await this.loadRecordOrThrow(projectId, recordId);
		const user = this.user;
		const manager = isManager(user.roles ?? []);
		const project = await this.projectRepo.findById(projectId);
		const isOwner = !!project?.ownerId && project.ownerId === user.id;
		const isResponsible = record.responsibleUserId === user.id;
		if (!manager && !isOwner && !isResponsible) {
			throw new ProjectPermissionError('Only the responsible person can submit this record.');
		}
		const patch: Record<string, unknown> = {
			status: 'submitted' as QmsRecordStatus,
			submittedAt: new Date().toISOString(),
			submittedById: user.id,
			rejectedReason: null
		};
		if (fields !== undefined) patch.fields = fields;
		await this.recordRepo.update(recordId, patch);
		if (record.taskId) await this.syncTaskGate(projectId, record.taskId);
		return { id: recordId, status: 'submitted' as QmsRecordStatus };
	}

	// -----------------------------------------------------------------------
	// Personal Workplace ("My Space")
	// -----------------------------------------------------------------------

	/**
	 * Everything the signed-in user needs to act on: tasks assigned to them and
	 * tasks where they're the responsible person on a QMS record, each grouped
	 * with the records they must fill (+ template download links).
	 */
	async getWorkplace(userId: string) {
		const [assigned, myRecords] = await Promise.all([
			this.taskRepo.assignedToUserWithProject(userId),
			this.recordRepo.listForResponsibleUser(userId)
		]);

		type WorkRecord = (typeof myRecords)[number];
		interface WorkTask {
			id: string;
			projectId: string;
			projectName: string | null;
			name: string;
			description: string | null;
			status: string;
			startDate: string | null;
			endDate: string | null;
			taskType: string | null;
			assignedToMe: boolean;
			records: WorkRecord[];
		}

		const byTask = new Map<string, WorkTask>();
		for (const t of assigned) {
			byTask.set(t.id, { ...t, assignedToMe: true, records: [] });
		}
		for (const r of myRecords) {
			if (!r.taskId) continue;
			let entry = byTask.get(r.taskId);
			if (!entry) {
				entry = {
					id: r.taskId,
					projectId: r.projectId,
					projectName: r.projectName ?? null,
					name: r.taskName ?? '(task)',
					description: r.taskDescription ?? null,
					status: r.taskStatus ?? 'unassigned',
					startDate: r.taskStartDate ?? null,
					endDate: r.taskEndDate ?? null,
					taskType: r.taskType ?? null,
					assignedToMe: false,
					records: []
				};
				byTask.set(r.taskId, entry);
			}
			entry.records.push(r);
		}

		// Active work first, completed last; within a group, soonest deadline first.
		const rank = (s: string) => (s === 'completed' ? 1 : 0);
		return [...byTask.values()].sort(
			(a, b) =>
				rank(a.status) - rank(b.status) ||
				(a.endDate ?? '9999').localeCompare(b.endDate ?? '9999')
		);
	}

	// -----------------------------------------------------------------------
	// Review workspace (PM / owner / admin)
	// -----------------------------------------------------------------------

	/**
	 * Tasks awaiting review (`under_review`) that this user may approve:
	 * managers/admins see all; otherwise only tasks in projects they own. Each
	 * carries its submission note + ISO records so the reviewer has full context.
	 */
	async listReviewQueue(userId: string) {
		const manager = isManager(this.user.roles ?? []);
		const rows = await this.taskRepo.listByStatusWithContext('under_review');
		const scoped = manager ? rows : rows.filter((r) => r.projectOwnerId === userId);
		return Promise.all(
			scoped.map(async (t) => ({ ...t, records: await this.recordRepo.listForTask(t.id) }))
		);
	}

	/** Approve a submitted task: approve its submitted ISO records (the gate then
	 * completes it), or — when there are no records — complete it directly. */
	async approveTask(projectId: string, taskId: string) {
		await this.assertCanEdit(projectId, true);
		const task = await this.taskRepo.findInProject(projectId, taskId);
		if (!task) throw new NotFoundError('Task', taskId);
		const records = await this.recordRepo.listForTask(taskId);
		const required = records.filter((r) => r.isRequired);
		if (required.length > 0) {
			const now = new Date().toISOString();
			for (const r of required) {
				if (r.status === 'submitted') {
					await this.recordRepo.update(r.id, {
						status: 'approved' as QmsRecordStatus,
						approvedAt: now,
						approvedById: this.user.id
					});
				}
			}
			await this.syncTaskGate(projectId, taskId);
		} else {
			await this.taskRepo.update(taskId, {
				status: 'completed',
				completedAt: new Date().toISOString(),
				progressPct: 100
			});
			await new ProjectTaskService(this.ctx).recomputeBlocked(projectId);
		}
		const fresh = await this.taskRepo.findInProject(projectId, taskId);
		return { status: fresh?.status ?? 'completed' };
	}

	/** Send a submitted task back to the assignee (→ ongoing). Rejects its
	 * submitted records with the reason so the assignee can rework + resubmit. */
	async rejectTask(projectId: string, taskId: string, reason: string | null) {
		await this.assertCanEdit(projectId, true);
		const task = await this.taskRepo.findInProject(projectId, taskId);
		if (!task) throw new NotFoundError('Task', taskId);
		const records = await this.recordRepo.listForTask(taskId);
		const submitted = records.filter((r) => r.isRequired && r.status === 'submitted');
		if (submitted.length > 0) {
			for (const r of submitted) {
				await this.recordRepo.update(r.id, {
					status: 'rejected' as QmsRecordStatus,
					rejectedReason: reason ?? null,
					version: (r.version ?? 1) + 1,
					approvedAt: null,
					approvedById: null
				});
			}
			await this.syncTaskGate(projectId, taskId);
		} else {
			await this.taskRepo.update(taskId, { status: 'ongoing', completedAt: null });
			await new ProjectTaskService(this.ctx).recomputeBlocked(projectId);
		}
		return { status: 'ongoing' as const, reason: reason ?? null };
	}

	/** True if the user may act on this task from the personal detail page:
	 * the assignee, a record's responsible person, or a manager/owner/collaborator. */
	private async canAccessTaskAsWorker(
		projectId: string,
		task: { assigneeId: string | null },
		userId: string
	): Promise<boolean> {
		const user = this.user;
		if (isManager(user.roles ?? [])) return true;
		if (task.assigneeId === userId) return true;
		const project = await this.projectRepo.findById(projectId);
		if (project?.ownerId === userId) return true;
		const collab = await this.collaboratorRepo.findByProjectAndUser(projectId, userId);
		return !!collab;
	}

	/** Full task detail for the assignee's personal task page (title, project,
	 * dates, description, submission note + the ISO records on the task). */
	async getTaskDetail(taskId: string, userId: string) {
		const task = await this.taskRepo.findById(taskId);
		if (!task) throw new NotFoundError('Task', taskId);
		const records = await this.recordRepo.listForTask(taskId);
		const allowed =
			(await this.canAccessTaskAsWorker(task.projectId, task, userId)) ||
			records.some((r) => r.responsibleUserId === userId);
		if (!allowed) {
			throw new ProjectPermissionError('You are not assigned to this task.');
		}
		const project = await this.projectRepo.findById(task.projectId);
		return {
			task: { ...task, projectName: project?.name ?? null },
			records,
			canManage: isManager(this.user.roles ?? []) || project?.ownerId === userId
		};
	}

	/**
	 * The assignee submits the task for PM review from their personal page.
	 * Uniform flow regardless of ISO: submit → under_review → PM completes.
	 *   - If the task has required ISO records: submit every still-open one
	 *     (saving the per-record note); the gate then advances the task (normally
	 *     to under_review, awaiting record approval).
	 *   - If the task has no records: just move it to under_review for the PM to
	 *     confirm. The PM completes it from the Gantt (the completion gate there
	 *     is a no-op when there are no required records).
	 * `note` is stored on the task; `recordNotes` overrides per-record content.
	 */
	async assigneeSubmitTask(
		projectId: string,
		taskId: string,
		opts: { note?: string | null; recordNotes?: Record<string, string> }
	) {
		const task = await this.taskRepo.findInProject(projectId, taskId);
		if (!task) throw new NotFoundError('Task', taskId);
		const user = this.user;
		if (!(await this.canAccessTaskAsWorker(projectId, task, user.id))) {
			throw new ProjectPermissionError('Only the task assignee can submit this task.');
		}

		const taskPatch: Record<string, unknown> = {};
		if (opts.note !== undefined) taskPatch.submissionNote = opts.note;

		const required = await this.recordRepo.requiredForTask(taskId);
		if (required.length > 0) {
			const now = new Date().toISOString();
			for (const r of required) {
				if (!['not_started', 'draft', 'rejected'].includes(r.status)) continue;
				const fields = opts.recordNotes?.[r.id] ?? r.fields ?? opts.note ?? null;
				await this.recordRepo.update(r.id, {
					status: 'submitted' as QmsRecordStatus,
					submittedAt: now,
					submittedById: user.id,
					rejectedReason: null,
					fields
				});
			}
			if (Object.keys(taskPatch).length > 0) await this.taskRepo.update(taskId, taskPatch);
			await this.syncTaskGate(projectId, taskId);
			const fresh = await this.taskRepo.findInProject(projectId, taskId);
			return { status: fresh?.status ?? 'under_review' };
		}

		// No ISO records — submit for PM review (do not self-complete).
		await this.taskRepo.update(taskId, {
			...taskPatch,
			status: 'under_review',
			completedAt: null
		});
		return { status: 'under_review' as const };
	}

	async approveRecord(projectId: string, recordId: string) {
		await this.assertCanEdit(projectId, true);
		const record = await this.loadRecordOrThrow(projectId, recordId);
		await this.recordRepo.update(recordId, {
			status: 'approved' as QmsRecordStatus,
			approvedAt: new Date().toISOString(),
			approvedById: this.user.id
		});
		if (record.taskId) await this.syncTaskGate(projectId, record.taskId);
		return { id: recordId, status: 'approved' as QmsRecordStatus };
	}

	async rejectRecord(projectId: string, recordId: string, reason: string | null) {
		await this.assertCanEdit(projectId, true);
		const record = await this.loadRecordOrThrow(projectId, recordId);
		await this.recordRepo.update(recordId, {
			status: 'rejected' as QmsRecordStatus,
			rejectedReason: reason ?? null,
			// Bump the version so document-control history shows the re-work cycle.
			version: (record.version ?? 1) + 1,
			approvedAt: null,
			approvedById: null
		});
		if (record.taskId) await this.syncTaskGate(projectId, record.taskId);
		return { id: recordId, status: 'rejected' as QmsRecordStatus };
	}

	/** Waive: a manager explicitly excuses a record from the gate. */
	async waiveRecord(projectId: string, recordId: string, reason: string | null) {
		await this.assertCanEdit(projectId, true);
		const record = await this.loadRecordOrThrow(projectId, recordId);
		await this.recordRepo.update(recordId, {
			status: 'waived' as QmsRecordStatus,
			waivedReason: reason ?? null
		});
		if (record.taskId) await this.syncTaskGate(projectId, record.taskId);
		return { id: recordId, status: 'waived' as QmsRecordStatus };
	}

	// -----------------------------------------------------------------------
	// Completion gate sync (records drive task status)
	// -----------------------------------------------------------------------

	/** A record satisfies the gate when approved, waived, or (when no approval
	 * is required) merely submitted. */
	private isSatisfied(r: { status: string; requiresApproval: boolean }): boolean {
		return (
			r.status === 'approved' ||
			r.status === 'waived' ||
			(!r.requiresApproval && r.status === 'submitted')
		);
	}

	/**
	 * Recompute the owning task's status from its required records:
	 *   all satisfied            → completed
	 *   all ≥ submitted (pending)→ under_review
	 *   any rejected             → ongoing
	 *   otherwise                → only downgrade a stale completed/under_review
	 *                              back to ongoing; never force unassigned tasks.
	 */
	async syncTaskGate(projectId: string, taskId: string) {
		const task = await this.taskRepo.findInProject(projectId, taskId);
		if (!task) return;
		const required = await this.recordRepo.requiredForTask(taskId);
		if (required.length === 0) return; // no gate — normal task flow applies

		const allSatisfied = required.every((r) => this.isSatisfied(r));
		const anyRejected = required.some((r) => r.status === 'rejected');
		const allSubmittedOrBeyond = required.every((r) =>
			['submitted', 'approved', 'waived'].includes(r.status)
		);

		let target: string | null = null;
		if (allSatisfied) target = 'completed';
		else if (anyRejected) target = 'ongoing';
		else if (allSubmittedOrBeyond) target = 'under_review';
		// Some records are still not_started/draft: only correct a stale terminal
		// status; leave unassigned/ongoing tasks untouched.
		else if (task.status === 'completed' || task.status === 'under_review') target = 'ongoing';

		if (!target || target === task.status) return;

		const patch: Record<string, unknown> = { status: target };
		if (target === 'completed') {
			patch.completedAt = new Date().toISOString();
			patch.progressPct = 100;
		} else {
			patch.completedAt = null;
		}
		await this.taskRepo.update(taskId, patch);

		// Completing (or re-opening) this task can (un)block its dependents.
		await new ProjectTaskService(this.ctx).recomputeBlocked(projectId);
	}

	/** Does the task have required records that aren't yet satisfied? Used by the
	 * task-service completion gate. */
	async hasUnsatisfiedRequiredRecords(taskId: string): Promise<boolean> {
		const required = await this.recordRepo.requiredForTask(taskId);
		return required.some((r) => !this.isSatisfied(r));
	}
}
