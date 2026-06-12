import { and, desc, eq, gte, isNull, like, or, sql, type SQL } from 'drizzle-orm';
import type { ModuleContext } from '$platform/modules/types';
import { ProjectRepository } from '../repositories/project-repository';
import { NotFoundError } from '$platform/modules/errors';
import { schema } from '$infrastructure/db';
import {
	activityVariantForAction,
	parseAuditMetadata,
	summarizeAuditForProject
} from '$modules/project/services/audit-display';

const PROJECT_LIST_PAGE_SIZE = 10;

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

/**
 * Project reads — detail, list, paginated list page, counts, shell, sub-projects.
 *
 * Future capabilities: `project.read` / `project.search`.
 */
export class ProjectQueryService {
	private repo: ProjectRepository;

	constructor(private ctx: ModuleContext) {
		this.repo = new ProjectRepository(ctx.db);
	}

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
			owner: owner ? { id: owner.id, email: owner.email, name: owner.name } : null,
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

	async getSubProjects(parentProjectId: string) {
		return this.repo.getSubProjects(parentProjectId);
	}
}
