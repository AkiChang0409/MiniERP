import { and, desc, eq, gte, isNull, like, or, sql, type SQL } from 'drizzle-orm';
import type { ModuleContext } from '$platform/modules/types';
import {
	ProjectRepository,
	ProjectMemberRepository,
	ProjectCollaboratorRepository,
	ProjectCommentRepository,
	ProjectAttachmentRepository,
	ProjectUserDirectory
} from '../repositories/project-repository';
import { NotFoundError } from '$platform/modules/errors';
import { createEvent } from '$platform/modules';
import { schema } from '$infrastructure/db';
import {
	activityVariantForAction,
	parseAuditMetadata,
	summarizeAuditForProject
} from '$modules/project/services/audit-display';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_LIST_PAGE_SIZE = 10;

/**
 * Statuses introduced by TKMGMT1 (image acceptance criteria) — kept distinct
 * from the legacy `active / archived / on_hold` set so this module can sit
 * alongside Wave 2.x data without breaking the existing dashboards.
 */
/** Statuses introduced by TKMGMT1 (image acceptance criteria) — kept distinct
 *  from the legacy `active / archived / on_hold` set so this module can sit
 *  alongside Wave 2.x data without breaking the existing dashboards.        */
type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';

// ---------------------------------------------------------------------------
// Module-level types
// ---------------------------------------------------------------------------

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

export class ProjectPermissionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProjectPermissionError';
	}
}

export class ProjectValidationError extends Error {
	readonly fields: Record<string, string>;
	constructor(fields: Record<string, string>) {
		super(`Validation failed: ${Object.keys(fields).join(', ')}`);
		this.name = 'ProjectValidationError';
		this.fields = fields;
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileLabelFromUrl(fileUrl: string | null, fallbackDate: string | null): string {
	if (!fileUrl || fileUrl.startsWith('manual://')) {
		return fallbackDate ? `Record · ${fallbackDate}` : 'Manual entry';
	}
	const tail = fileUrl.split('/').pop() ?? fileUrl;
	try {
		return decodeURIComponent(tail) || 'Document';
	} catch {
		return tail;
	}
}

/** Required fields per TKMGMT1 / TKMGMT2 acceptance criteria. */
function validateRequired(name: string | undefined, deadline: string | null | undefined) {
	const fields: Record<string, string> = {};
	if (name !== undefined && (!name || !name.trim())) {
		fields.name = 'Project name is required.';
	}
	if (deadline !== undefined && (!deadline || !String(deadline).trim())) {
		fields.deadline = 'Deadline is required.';
	}
	if (Object.keys(fields).length > 0) throw new ProjectValidationError(fields);
}

function isManager(roles: readonly string[] | null | undefined): boolean {
	if (!roles) return false;
	return roles.some((r) => r === 'owner' || r === 'admin' || r === 'project_manager');
}

function parseRoles(raw: string | null | undefined): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string');
		if (typeof parsed === 'string') return [parsed];
	} catch {
		if (typeof raw === 'string' && raw.length > 0) return [raw];
	}
	return [];
}

/** Extract @-mention tokens. Tokens may be either a userId or an email-prefix. */
function extractMentionTokens(body: string): string[] {
	const matches = body.match(/@[A-Za-z0-9_.+\-]+/g);
	if (!matches) return [];
	return Array.from(new Set(matches.map((m) => m.slice(1))));
}

function addDaysIso(dateIso: string, days: number): string {
	// Treat the deadline as a date (YYYY-MM-DD). Adding days in UTC keeps the
	// math timezone-agnostic — we never round-trip to a wall-clock time.
	const base = new Date(`${dateIso}T00:00:00Z`);
	if (Number.isNaN(base.getTime())) return dateIso;
	base.setUTCDate(base.getUTCDate() + days);
	return base.toISOString().slice(0, 10);
}

function addMonthsIso(dateIso: string, months: number): string {
	const base = new Date(`${dateIso}T00:00:00Z`);
	if (Number.isNaN(base.getTime())) return dateIso;
	const targetMonth = base.getUTCMonth() + months;
	base.setUTCMonth(targetMonth);
	return base.toISOString().slice(0, 10);
}

/** Compute the *next* deadline in a recurring series. */
export function computeNextDeadline(
	currentDeadline: string,
	frequency: RecurrenceFrequency,
	intervalDays?: number | null
): string {
	switch (frequency) {
		case 'daily':
			return addDaysIso(currentDeadline, 1);
		case 'weekly':
			return addDaysIso(currentDeadline, 7);
		case 'monthly':
			return addMonthsIso(currentDeadline, 1);
		case 'custom':
			return addDaysIso(currentDeadline, Math.max(1, intervalDays ?? 1));
	}
}

// ---------------------------------------------------------------------------
// ProjectService
// ---------------------------------------------------------------------------

export class ProjectService {
	private repo: ProjectRepository;
	private memberRepo: ProjectMemberRepository;
	private collaboratorRepo: ProjectCollaboratorRepository;
	private commentRepo: ProjectCommentRepository;
	private attachmentRepo: ProjectAttachmentRepository;
	private userDirectory: ProjectUserDirectory;

	constructor(private ctx: ModuleContext) {
		this.repo = new ProjectRepository(ctx.db);
		this.memberRepo = new ProjectMemberRepository(ctx.db);
		this.collaboratorRepo = new ProjectCollaboratorRepository(ctx.db);
		this.commentRepo = new ProjectCommentRepository(ctx.db);
		this.attachmentRepo = new ProjectAttachmentRepository(ctx.db);
		this.userDirectory = new ProjectUserDirectory(ctx.db);
	}

	// -----------------------------------------------------------------------
	// Reads
	// -----------------------------------------------------------------------

	async getById(id: string) {
		const p = await this.repo.findById(id);
		if (!p) throw new NotFoundError('Project', id);
		return p;
	}

	async getWithCustomer(id: string) {
		const result = await this.repo.findWithCustomer(id);
		if (!result) throw new NotFoundError('Project', id);
		return result;
	}

	async list(opts?: {
		q?: string;
		status?: string;
		page?: number;
		pageSize?: number;
		ownerId?: string;
		participantUserId?: string;
	}) {
		return this.repo.list(opts);
	}

	async getProjectListPage(input: {
		q?: string | null;
		status?: string | null;
		startedAfter?: string | null;
		page?: number | null;
		scope?: 'all' | 'mine' | null;
	}) {
		const db = this.ctx.db;
		const q = input.q?.trim() ?? '';
		const status = input.status?.trim() ?? '';
		const startedAfter = input.startedAfter?.trim() ?? '';
		const scope = input.scope ?? 'all';
		const pageRaw = input.page ?? 1;
		const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

		const currentUserId = this.ctx.user?.id ?? null;

		const projectConditions: SQL[] = [isNull(schema.projects.deletedAt)];
		if (q) {
			projectConditions.push(
				or(
					like(schema.projects.name, `%${q}%`),
					like(schema.projects.id, `%${q}%`),
					like(sql`coalesce(${schema.businessPartners.name}, '')`, `%${q}%`)
				)!
			);
		}
		if (status) projectConditions.push(eq(schema.projects.status, status));
		if (startedAfter) projectConditions.push(gte(schema.projects.startDate, startedAfter));
		if (scope === 'mine' && currentUserId) {
			const collabSubquery = db
				.select({ id: schema.projectCollaborators.projectId })
				.from(schema.projectCollaborators)
				.where(
					and(
						eq(schema.projectCollaborators.userId, currentUserId),
						isNull(schema.projectCollaborators.deletedAt)
					)
				);
			projectConditions.push(
				or(
					eq(schema.projects.ownerId, currentUserId),
					sql`${schema.projects.id} in ${collabSubquery}`
				)!
			);
		}

		const [[allProjectsCountRow], [activeProjectsCountRow], projectCountRows] = await Promise.all([
			db
				.select({ n: sql<number>`count(*)` })
				.from(schema.projects)
				.where(isNull(schema.projects.deletedAt)),
			db
				.select({ n: sql<number>`count(*)` })
				.from(schema.projects)
				.where(and(isNull(schema.projects.deletedAt), eq(schema.projects.status, 'active'))),
			db
				.select({ total: sql<number>`count(*)` })
				.from(schema.projects)
				.leftJoin(
					schema.businessPartners,
					eq(schema.projects.businessPartnerId, schema.businessPartners.id)
				)
				.where(and(...projectConditions))
		]);

		const total = Number(projectCountRows[0]?.total ?? 0);
		const totalPages = Math.max(1, Math.ceil(total / PROJECT_LIST_PAGE_SIZE));
		const safePage = Math.min(page, totalPages);
		const safeOffset = (safePage - 1) * PROJECT_LIST_PAGE_SIZE;

		const projectRows = await db
			.select({
				id: schema.projects.id,
				name: schema.projects.name,
				customerId: schema.projects.businessPartnerId,
				status: schema.projects.status,
				startDate: schema.projects.startDate,
				endDate: schema.projects.endDate,
				deadline: schema.projects.deadline,
				priority: schema.projects.priority,
				ownerId: schema.projects.ownerId,
				ownerEmail: schema.users.email,
				ownerName: schema.users.name,
				updatedAt: schema.projects.updatedAt,
				customerName: schema.businessPartners.name
			})
			.from(schema.projects)
			.leftJoin(
				schema.businessPartners,
				eq(schema.projects.businessPartnerId, schema.businessPartners.id)
			)
			.leftJoin(schema.users, eq(schema.projects.ownerId, schema.users.id))
			.where(and(...projectConditions))
			.orderBy(desc(schema.projects.updatedAt))
			.limit(PROJECT_LIST_PAGE_SIZE)
			.offset(safeOffset);

		const invoiceCountRows = await db
			.select({ projectId: schema.revenue.projectId, total: sql<number>`count(*)` })
			.from(schema.revenue)
			.where(isNull(schema.revenue.deletedAt))
			.groupBy(schema.revenue.projectId);
		const invoiceCountMap = new Map(
			invoiceCountRows.map((row) => [row.projectId, Number(row.total ?? 0)])
		);

		const projects = projectRows.map((row) => ({
			...row,
			customerName: row.customerName ?? row.customerId,
			invoiceCount: invoiceCountMap.get(row.id) ?? 0
		}));

		return {
			projects,
			projectListCounts: {
				all: Number(allProjectsCountRow?.n ?? 0),
				active: Number(activeProjectsCountRow?.n ?? 0)
			},
			filters: {
				q,
				status,
				startedAfter,
				scope,
				page: safePage
			},
			pagination: {
				page: safePage,
				pageSize: PROJECT_LIST_PAGE_SIZE,
				total,
				totalPages,
				hasPrev: safePage > 1,
				hasNext: safePage < totalPages
			}
		};
	}

	async getListCounts() {
		return this.repo.getListCounts();
	}

	async getProjectShell(projectId: string) {
		const db = this.ctx.db;
		const [project] = await db
			.select()
			.from(schema.projects)
			.where(and(eq(schema.projects.id, projectId), isNull(schema.projects.deletedAt)))
			.limit(1);

		if (!project) {
			throw new NotFoundError('Project', projectId);
		}

		const [customer] = project.businessPartnerId
			? await db
					.select({ id: schema.businessPartners.id, name: schema.businessPartners.name })
					.from(schema.businessPartners)
					.where(eq(schema.businessPartners.id, project.businessPartnerId))
					.limit(1)
			: [];

		// Resolve owner via platform/auth users table (allowed: module → platform).
		// Surfaced as `owner` at the top of the shell payload, parallel to
		// `customerName`, so the page can render a human-readable label without
		// having to ask the user directory again.
		const [owner] = project.ownerId
			? await db
					.select({
						id: schema.users.id,
						email: schema.users.email,
						name: schema.users.name
					})
					.from(schema.users)
					.where(eq(schema.users.id, project.ownerId))
					.limit(1)
			: [];

		const [
			[allProjectsCountRow],
			[activeProjectsCountRow],
			[contractsCountRow],
			[quotationsCountRow],
			[purchaseOrdersCountRow],
			[expensesCountRow]
		] = await Promise.all([
			db
				.select({ n: sql<number>`count(*)` })
				.from(schema.projects)
				.where(isNull(schema.projects.deletedAt)),
			db
				.select({ n: sql<number>`count(*)` })
				.from(schema.projects)
				.where(and(isNull(schema.projects.deletedAt), eq(schema.projects.status, 'active'))),
			db
				.select({ n: sql<number>`count(*)` })
				.from(schema.contracts)
				.where(and(eq(schema.contracts.projectId, projectId), isNull(schema.contracts.deletedAt))),
			db
				.select({ n: sql<number>`count(*)` })
				.from(schema.quotations)
				.where(and(eq(schema.quotations.projectId, projectId), isNull(schema.quotations.deletedAt))),
			db
				.select({ n: sql<number>`count(*)` })
				.from(schema.purchaseOrders)
				.where(
					and(eq(schema.purchaseOrders.projectId, projectId), isNull(schema.purchaseOrders.deletedAt))
				),
			db
				.select({ n: sql<number>`count(*)` })
				.from(schema.expenses)
				.where(and(eq(schema.expenses.projectId, projectId), isNull(schema.expenses.deletedAt)))
		]);

		const [contractsPick, quotationsPick, purchaseOrdersPick, expensesPickRows] = await Promise.all([
			db
				.select({
					id: schema.contracts.id,
					fileUrl: schema.contracts.fileUrl,
					date: schema.contracts.effectiveDate,
					amount: schema.contracts.amount,
					currency: schema.contracts.currency
				})
				.from(schema.contracts)
				.where(and(eq(schema.contracts.projectId, projectId), isNull(schema.contracts.deletedAt)))
				.orderBy(desc(schema.contracts.createdAt)),
			db
				.select({
					id: schema.quotations.id,
					fileUrl: schema.quotations.fileUrl,
					date: schema.quotations.date,
					amount: schema.quotations.amount,
					currency: schema.quotations.currency,
					quotationNumber: schema.quotations.quotationNumber
				})
				.from(schema.quotations)
				.where(and(eq(schema.quotations.projectId, projectId), isNull(schema.quotations.deletedAt)))
				.orderBy(desc(schema.quotations.createdAt)),
			db
				.select({
					id: schema.purchaseOrders.id,
					poNumber: schema.purchaseOrders.poNumber,
					supplierName: schema.purchaseOrders.supplierName,
					date: schema.purchaseOrders.date,
					amount: schema.purchaseOrders.amount,
					currency: schema.purchaseOrders.currency
				})
				.from(schema.purchaseOrders)
				.where(
					and(eq(schema.purchaseOrders.projectId, projectId), isNull(schema.purchaseOrders.deletedAt))
				)
				.orderBy(desc(schema.purchaseOrders.createdAt)),
			db
				.select({
					id: schema.expenses.id,
					category: schema.expenses.category,
					expenseType: schema.expenses.expenseType,
					date: schema.expenses.date,
					amount: schema.expenses.amount,
					currency: schema.expenses.currency
				})
				.from(schema.expenses)
				.where(and(eq(schema.expenses.projectId, projectId), isNull(schema.expenses.deletedAt)))
				.orderBy(desc(schema.expenses.date), desc(schema.expenses.createdAt))
		]);

		const arPickLists = {
			contracts: contractsPick.map((row) => ({
				id: row.id,
				label: fileLabelFromUrl(row.fileUrl, row.date),
				subtitle: `${row.date ?? '-'} - ${row.amount ?? 0} ${row.currency ?? 'SGD'}`
			})),
			quotations: quotationsPick.map((row) => ({
				id: row.id,
				label: fileLabelFromUrl(row.fileUrl ?? '', row.date),
				subtitle: `${row.date ?? '-'} - ${row.amount ?? 0} ${row.currency ?? 'SGD'}${row.quotationNumber ? ` - ${row.quotationNumber}` : ''}`
			})),
			purchaseOrders: purchaseOrdersPick.map((row) => ({
				id: row.id,
				label: row.poNumber,
				subtitle: `${row.supplierName ?? '-'} - ${row.date ?? '-'} - ${row.amount ?? 0} ${row.currency ?? 'SGD'}`
			})),
			expenses: expensesPickRows.map((row) => ({
				id: row.id,
				label: `${row.expenseType === 'sales_cost' ? 'SC' : 'OpEx'}: ${row.category}`,
				subtitle: `${row.date ?? '-'} - ${row.amount ?? 0} ${row.currency ?? 'SGD'}`
			}))
		};

		const activityRows = await db
			.select({
				id: schema.auditLogs.id,
				action: schema.auditLogs.action,
				actorEmail: schema.auditLogs.actorEmail,
				createdAt: schema.auditLogs.createdAt,
				metadata: schema.auditLogs.metadata
			})
			.from(schema.auditLogs)
			.where(eq(schema.auditLogs.projectId, projectId))
			.orderBy(desc(schema.auditLogs.createdAt))
			.limit(25);

		const activityFeed = activityRows.map((row) => {
			const meta = parseAuditMetadata(row.metadata);
			const when = new Date(row.createdAt);
			const timeLabel = Number.isNaN(when.getTime())
				? row.createdAt
				: when.toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' });
			return {
				id: row.id,
				summary: summarizeAuditForProject(row.action, meta),
				actor: row.actorEmail ?? 'System',
				timeLabel,
				variant: activityVariantForAction(row.action)
			};
		});

		return {
			project,
			customerName: customer?.name ?? project.businessPartnerId ?? '',
			owner: owner
				? { id: owner.id, email: owner.email, name: owner.name }
				: null,
			ownerLabel: owner?.name ?? owner?.email ?? null,
			projectListCounts: {
				all: Number(allProjectsCountRow?.n ?? 0),
				active: Number(activeProjectsCountRow?.n ?? 0)
			},
			submoduleCounts: {
				contracts: Number(contractsCountRow?.n ?? 0),
				quotations: Number(quotationsCountRow?.n ?? 0),
				purchaseOrders: Number(purchaseOrdersCountRow?.n ?? 0),
				expenses: Number(expensesCountRow?.n ?? 0)
			},
			arPickLists,
			activityFeed
		};
	}

	// -----------------------------------------------------------------------
	// Writes
	// -----------------------------------------------------------------------

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
				await this.addCollaborator({ projectId, userId: c.userId, role: c.role ?? null });
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

		const scope = this.getEditableScopeFor(existing.ownerId, existing.id);
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

	// -----------------------------------------------------------------------
	// Members (legacy HR allocation)
	// -----------------------------------------------------------------------

	async getMembers(projectId: string) {
		return this.repo.getMembers(projectId);
	}

	async addMember(data: {
		projectId: string;
		employeeId: string;
		name: string;
		role?: string;
		staffType?: string;
		dateIn?: string;
		cpfApplicable?: boolean;
	}) {
		return this.memberRepo.create(data);
	}

	async removeMember(memberId: string) {
		return this.memberRepo.softDelete(memberId);
	}

	// -----------------------------------------------------------------------
	// Collaborators (TKMGMT1 / TKMGMT2 / TKMGMT3 / TKMGMT9)
	// -----------------------------------------------------------------------

	async listCollaborators(projectId: string) {
		return this.collaboratorRepo.listForProject(projectId);
	}

	async addCollaborator(input: { projectId: string; userId: string; role?: string | null }) {
		const existing = await this.collaboratorRepo.findByProjectAndUser(input.projectId, input.userId);
		if (existing) {
			if (input.role !== undefined && input.role !== existing.role) {
				await this.collaboratorRepo.update(existing.id, { role: input.role ?? null });
			}
			return { id: existing.id, alreadyExisted: true };
		}
		return this.collaboratorRepo.create({
			id: crypto.randomUUID(),
			projectId: input.projectId,
			userId: input.userId,
			role: input.role ?? null
		});
	}

	async addCollaboratorByEmail(input: { projectId: string; email: string; role?: string | null }) {
		const user = await this.userDirectory.findByEmail(input.email);
		if (!user) {
			throw new ProjectValidationError({
				email: `No user found with email ${input.email}.`
			});
		}
		return this.addCollaborator({
			projectId: input.projectId,
			userId: user.id,
			role: input.role ?? null
		});
	}

	async removeCollaborator(projectId: string, userId: string) {
		return this.collaboratorRepo.removeByProjectAndUser(projectId, userId);
	}

	// -----------------------------------------------------------------------
	// Comments (TKMGMT9)
	// -----------------------------------------------------------------------

	async listComments(projectId: string) {
		const rows = await this.commentRepo.listForProject(projectId);
		return rows.map((c) => ({
			...c,
			mentions: c.mentions
				? (JSON.parse(c.mentions) as Array<{ userId: string; email: string; name: string }>)
				: []
		}));
	}

	async addComment(input: { projectId: string; body: string }) {
		const body = input.body.trim();
		if (!body) {
			throw new ProjectValidationError({ body: 'Comment body cannot be empty.' });
		}

		const user = this.ctx.user;
		if (!user) {
			throw new ProjectPermissionError('Sign in to post a comment.');
		}

		const tokens = extractMentionTokens(body);
		const resolvedMentions: Array<{ userId: string; email: string; name: string }> = [];
		if (tokens.length > 0) {
			// A token may be an exact userId, an email, or an email-prefix.
			for (const token of tokens) {
				const byEmail = await this.userDirectory.findByEmail(token);
				if (byEmail) {
					resolvedMentions.push({ userId: byEmail.id, email: byEmail.email, name: byEmail.name });
					continue;
				}
				const candidates = await this.userDirectory.findByEmailPrefix(token, 1);
				if (candidates.length > 0) {
					const u = candidates[0];
					resolvedMentions.push({ userId: u.id, email: u.email, name: u.name });
				}
			}
		}

		const id = crypto.randomUUID();
		await this.commentRepo.create({
			id,
			projectId: input.projectId,
			authorUserId: user.id,
			authorEmail: user.email,
			authorName: user.email.split('@')[0] ?? user.email,
			body,
			mentions: resolvedMentions.length > 0 ? JSON.stringify(resolvedMentions) : null
		});

		return { id, mentions: resolvedMentions };
	}

	// -----------------------------------------------------------------------
	// Attachments (TKMGMT1 v2 — multi-file)
	// -----------------------------------------------------------------------

	/**
	 * Returns the canonical attachment list for the project. Includes any rows
	 * in `project_attachments` and synthesizes a virtual entry for the legacy
	 * single-file columns (`projects.attachment_url` / `_name`) when they're
	 * still populated — that way old data still renders, but new uploads always
	 * go through the multi-file table.
	 */
	async listAttachments(projectId: string) {
		const project = await this.repo.findById(projectId);
		if (!project) throw new NotFoundError('Project', projectId);

		const rows = await this.attachmentRepo.listForProject(projectId);
		const out = rows.map((row) => ({
			id: row.id,
			fileName: row.fileName,
			url: row.url,
			storageKey: row.storageKey,
			contentType: row.contentType ?? null,
			sizeBytes: row.sizeBytes ?? null,
			uploadedById: row.uploadedById ?? null,
			uploadedByEmail: row.uploadedByEmail ?? null,
			createdAt: row.createdAt,
			legacy: false
		}));

		// Legacy single-file fallback: render the old columns as a read-only
		// list entry. The UI treats it specially (no delete) so users can
		// re-upload it through the new flow at their leisure.
		if (project.attachmentUrl) {
			out.unshift({
				id: '__legacy__',
				fileName: project.attachmentName ?? 'Attachment',
				url: project.attachmentUrl,
				storageKey: '',
				contentType: null,
				sizeBytes: null,
				uploadedById: null,
				uploadedByEmail: null,
				createdAt: project.createdAt,
				legacy: true
			});
		}
		return out;
	}

	/**
	 * Insert an attachment row. The route is responsible for putting the bytes
	 * in R2 first; this service only persists the metadata.
	 *
	 * Permission: collaborator-or-better. TKMGMT2 lists attachments as
	 * non-crucial fields, so any collaborator may add / remove them.
	 */
	async addAttachment(input: {
		projectId: string;
		storageKey: string;
		url: string;
		fileName: string;
		contentType?: string | null;
		sizeBytes?: number | null;
	}) {
		const project = await this.repo.findById(input.projectId);
		if (!project) throw new NotFoundError('Project', input.projectId);

		const scope = this.getEditableScopeFor(project.ownerId, project.id);
		if (scope === 'none') {
			throw new ProjectPermissionError(
				'Only owners, managers, or collaborators may attach files to this project.'
			);
		}

		const user = this.ctx.user;
		const id = crypto.randomUUID();
		await this.attachmentRepo.create({
			id,
			projectId: input.projectId,
			storageKey: input.storageKey,
			url: input.url,
			fileName: input.fileName,
			contentType: input.contentType ?? null,
			sizeBytes: input.sizeBytes ?? null,
			uploadedById: user?.id ?? null,
			uploadedByEmail: user?.email ?? null
		});
		return {
			id,
			projectId: input.projectId,
			storageKey: input.storageKey,
			url: input.url,
			fileName: input.fileName,
			contentType: input.contentType ?? null,
			sizeBytes: input.sizeBytes ?? null,
			uploadedById: user?.id ?? null,
			uploadedByEmail: user?.email ?? null
		};
	}

	/**
	 * Soft-delete an attachment. The R2 object is intentionally left behind —
	 * a retention sweep job handles physical cleanup, consistent with the
	 * document-intake `abandonIntake` pattern (BaseLine §3.6).
	 *
	 * Returns `{ removed: boolean, storageKey: string | null }` so the route
	 * can decide whether to also delete the R2 object inline (we expose the
	 * key but don't delete here, to keep the service env-agnostic).
	 */
	async removeAttachment(projectId: string, attachmentId: string) {
		const project = await this.repo.findById(projectId);
		if (!project) throw new NotFoundError('Project', projectId);

		const scope = this.getEditableScopeFor(project.ownerId, project.id);
		if (scope === 'none') {
			throw new ProjectPermissionError(
				'Only owners, managers, or collaborators may remove attachments.'
			);
		}

		const row = await this.attachmentRepo.findOwnedByProject(projectId, attachmentId);
		if (!row) return { removed: false, storageKey: null as string | null };
		await this.attachmentRepo.softDelete(row.id);
		return { removed: true, storageKey: row.storageKey };
	}

	/**
	 * Clear the legacy single-file columns. Used by the UI when the user
	 * removes the synthesized "legacy" entry — actual `project_attachments`
	 * rows go through `removeAttachment` instead.
	 */
	async clearLegacyAttachment(projectId: string) {
		const project = await this.repo.findById(projectId);
		if (!project) throw new NotFoundError('Project', projectId);
		const scope = this.getEditableScopeFor(project.ownerId, project.id);
		if (scope === 'none') {
			throw new ProjectPermissionError(
				'Only owners, managers, or collaborators may remove attachments.'
			);
		}
		await this.repo.update(projectId, {
			attachmentUrl: null,
			attachmentName: null
		});
		return { removed: true };
	}

	// -----------------------------------------------------------------------
	// Permissions
	// -----------------------------------------------------------------------

	private getEditableScopeFor(
		projectOwnerId: string | null,
		_projectId: string
	): 'manager' | 'owner' | 'collaborator' | 'none' {
		const user = this.ctx.user;
		if (!user) return 'none';
		if (isManager(user.roles ?? [])) return 'manager';
		if (projectOwnerId && projectOwnerId === user.id) return 'owner';
		return 'collaborator';
	}

	/** Used by routes / pages to figure out which actions to enable in the UI. */
	async getEditableScope(projectId: string) {
		const user = this.ctx.user;
		const project = await this.repo.findById(projectId);
		if (!project || !user) return 'none' as const;
		if (isManager(user.roles ?? [])) return 'manager' as const;
		if (project.ownerId && project.ownerId === user.id) return 'owner' as const;
		const collab = await this.collaboratorRepo.findByProjectAndUser(projectId, user.id);
		if (collab) return 'collaborator' as const;
		return 'none' as const;
	}

	// -----------------------------------------------------------------------
	// Sub-projects (TKMGMT1)
	// -----------------------------------------------------------------------

	async getSubProjects(parentProjectId: string) {
		return this.repo.getSubProjects(parentProjectId);
	}

	// -----------------------------------------------------------------------
	// Recurrence & completion (TKMGMT6 / TKMGMT7)
	// -----------------------------------------------------------------------

	/**
	 * Mark a project as completed. If the project carries a recurrence
	 * frequency, also create the next occurrence with everything (notes,
	 * collaborators, attachment) carried over and the deadline shifted.
	 *
	 * Returns the freshly-created child project id when one was generated.
	 */
	async completeAndMaybeRecur(projectId: string): Promise<{ nextProjectId: string | null }> {
		const project = await this.getById(projectId);
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
		const collaborators = await this.collaboratorRepo.listForProject(projectId);
		for (const c of collaborators) {
			await this.addCollaborator({ projectId: nextId, userId: c.userId, role: c.role ?? null });
		}

		await this.ctx.eventBus.emit(
			createEvent('project.recurrence.spawned', 'project', {
				projectId: nextId,
				sourceProjectId: projectId
			})
		);

		return { nextProjectId: nextId };
	}

	// -----------------------------------------------------------------------
	// Dashboard / calendar (TKMGMT8 / TKMGMT10)
	// -----------------------------------------------------------------------

	async getDashboard() {
		const now = new Date();
		const todayIso = now.toISOString().slice(0, 10);
		const inSevenDays = new Date(now);
		inSevenDays.setDate(inSevenDays.getDate() + 7);
		const inSevenIso = inSevenDays.toISOString().slice(0, 10);

		const [statusSummary, upcoming, overdue] = await Promise.all([
			this.repo.getStatusSummary(),
			this.repo.getUpcomingDeadlines({ fromIso: todayIso, toIso: inSevenIso, limit: 5 }),
			this.repo.getOverdue({ nowIso: todayIso })
		]);

		return {
			generatedAt: now.toISOString(),
			statusSummary,
			upcoming,
			overdue,
			lookahead: { from: todayIso, to: inSevenIso }
		};
	}

	async getCalendarEntries(opts: { fromIso: string; toIso: string }) {
		return this.repo.getCalendarEntries(opts);
	}

	// -----------------------------------------------------------------------
	// Profit (existing)
	// -----------------------------------------------------------------------

	async getProjectFinancials(
		projectId: string,
		deps: {
			getRevenue: () => Promise<number>;
			getPurchaseCost: () => Promise<number>;
			getStaffCost: () => Promise<number>;
			getExpenseSums: () => Promise<{ cogs: number; opex: number }>;
		}
	) {
		const [revenue, purchaseCost, staffCost, expenseSums] = await Promise.all([
			deps.getRevenue(),
			deps.getPurchaseCost(),
			deps.getStaffCost(),
			deps.getExpenseSums()
		]);

		const expenseCogs = expenseSums.cogs;
		const expenseOpex = expenseSums.opex;
		const grossProfit = revenue - purchaseCost - staffCost - expenseCogs;
		const netProfit = grossProfit - expenseOpex;
		const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

		return {
			revenue,
			purchaseCost,
			staffCost,
			expenseCogs,
			expenseOpex,
			grossProfit,
			netProfit,
			margin: Math.round(margin * 100) / 100
		};
	}

	// -----------------------------------------------------------------------
	// User directory passthrough (used by routes to render collaborator picker)
	// -----------------------------------------------------------------------

	async searchUsers(prefix: string) {
		if (!prefix || prefix.length < 1) return [];
		return this.userDirectory.findByEmailPrefix(prefix);
	}

	async listUsers() {
		return this.userDirectory.listAll();
	}
}

// Re-export the role helper for routes that need to render badges.
export { parseRoles as parseUserRoles };
