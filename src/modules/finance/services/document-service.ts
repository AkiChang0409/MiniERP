import { and, desc, eq, isNull, like, or, sql, type SQL } from 'drizzle-orm';
import {
	buildDocumentMetadata,
	parseDocumentMetadata
} from '$modules/finance/domain/document-metadata';
import { r2FileUrls } from '$platform/files/r2-file-urls';
import type { ModuleContext } from '$platform/modules/types';
import { auditLogs, contracts, purchaseOrders, quotations } from '../../../infrastructure/db/schema';
import { DocumentRepository } from '../repositories';
import {
	fileViewUrl,
	getDocHubProjectPicker,
	parseProjectFilters,
	textParam,
	tryParseJson
} from './doc-hub-shared';

type ProjectDocumentResult =
	| { ok: true; data: unknown; status: number }
	| { ok: false; message: string; status: number; details?: unknown };

function success(data: unknown, status = 200): ProjectDocumentResult {
	return { ok: true, data, status };
}

function failure(message: string, status = 400, details?: unknown): ProjectDocumentResult {
	return { ok: false, message, status, details };
}

function errorChainText(error: unknown): string {
	if (error instanceof Error) {
		const parts = [error.message];
		let cause: unknown = error.cause;
		let depth = 0;
		while (cause instanceof Error && depth < 5) {
			parts.push(cause.message);
			cause = cause.cause;
			depth += 1;
		}
		return parts.join(' ');
	}
	return String(error);
}

function isUniqueConstraintError(text: string): boolean {
	const normalized = text.toLowerCase();
	return (
		normalized.includes('unique') ||
		normalized.includes('sqlite_constraint_unique') ||
		(normalized.includes('constraint failed') &&
			(normalized.includes('invoice_no') ||
				normalized.includes('po_number') ||
				normalized.includes('invoices_out')))
	);
}

function isForeignKeyConstraintError(text: string): boolean {
	const normalized = text.toLowerCase();
	return (
		normalized.includes('foreign key') ||
		normalized.includes('sqlite_constraint_foreignkey') ||
		(normalized.includes('constraint failed') && normalized.includes('foreign key'))
	);
}

function str(value: unknown): string {
	return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function optNum(value: unknown): number | null {
	const text = str(value);
	if (!text) return null;
	const parsed = Number.parseFloat(text);
	return Number.isFinite(parsed) ? parsed : null;
}

function num0(value: unknown): number {
	return optNum(value) ?? 0;
}

function nowIso() {
	return new Date().toISOString();
}

export function createFinanceDocumentApi(ctx: ModuleContext) {
	const documentRepository = new DocumentRepository(ctx.db);

	const auditSafe = async (input: {
		action: string;
		entityType: string;
		entityId?: string | null;
		projectId?: string | null;
		metadata?: Record<string, unknown>;
	}) => {
		try {
			const now = nowIso();
			await ctx.db.insert(auditLogs).values({
				id: crypto.randomUUID(),
				actorUserId: ctx.user?.id ?? null,
				actorEmail: ctx.user?.email ?? null,
				action: input.action,
				entityType: input.entityType,
				entityId: input.entityId ?? null,
				projectId: input.projectId ?? null,
				metadata: input.metadata ? JSON.stringify(input.metadata) : null,
				createdAt: now,
				updatedAt: now
			});
		} catch (error) {
			console.error('[finance.save-project-document] audit log failed:', errorChainText(error));
		}
	};


	const getContractDocHubPage = async (params: URLSearchParams) => {
		const projectFilters = parseProjectFilters(params);
		const contractQ = textParam(params, 'contractQ');
		const listModeRaw = textParam(params, 'listMode', 'all');
		const contractFieldRaw = textParam(params, 'contractField', 'all');
		const listMode =
			listModeRaw === 'all' || listModeRaw === 'unassigned' || listModeRaw === 'selected'
				? listModeRaw
				: 'all';
		const contractField =
			contractFieldRaw === 'id' ||
			contractFieldRaw === 'amount' ||
			contractFieldRaw === 'date' ||
			contractFieldRaw === 'notes' ||
			contractFieldRaw === 'all'
				? contractFieldRaw
				: 'all';

		const conditions: SQL[] = [isNull(contracts.deletedAt)];
		if (listMode === 'selected') {
			conditions.push(projectFilters.projectId ? eq(contracts.projectId, projectFilters.projectId) : sql`1 = 0`);
		} else if (listMode === 'unassigned') {
			conditions.push(isNull(contracts.projectId));
		}
		if (contractQ) {
			if (contractField === 'id') {
				conditions.push(like(contracts.id, `%${contractQ}%`));
			} else if (contractField === 'amount') {
				conditions.push(like(sql`cast(coalesce(${contracts.amount}, 0) as text)`, `%${contractQ}%`));
			} else if (contractField === 'date') {
				conditions.push(like(contracts.effectiveDate, `%${contractQ}%`));
			} else if (contractField === 'notes') {
				conditions.push(like(sql`coalesce(${contracts.metadata}, '')`, `%${contractQ}%`));
			} else {
				conditions.push(
					or(
						like(contracts.id, `%${contractQ}%`),
						like(sql`cast(coalesce(${contracts.amount}, 0) as text)`, `%${contractQ}%`),
						like(contracts.effectiveDate, `%${contractQ}%`),
						like(sql`coalesce(${contracts.metadata}, '')`, `%${contractQ}%`)
					)!
				);
			}
		}

		const contractRows = await ctx.db
			.select()
			.from(contracts)
			.where(and(...conditions))
			.orderBy(desc(contracts.effectiveDate), desc(contracts.createdAt));
		const countRows = await ctx.db
			.select({ projectId: contracts.projectId, total: sql<number>`count(*)` })
			.from(contracts)
			.where(isNull(contracts.deletedAt))
			.groupBy(contracts.projectId);
		const projectPage = await getDocHubProjectPicker(
			ctx.db,
			projectFilters,
			countRows,
			contractRows.map((item) => item.projectId),
			'contractCount'
		);

		return {
			contracts: contractRows.map((item) => ({
				...item,
				projectName: item.projectId
					? projectPage.projectMap.get(item.projectId) ?? item.projectId
					: 'Unassigned Contract',
				fileViewUrl: fileViewUrl(item.fileUrl),
				docMeta: parseDocumentMetadata(item.metadata)
			})),
			projects: projectPage.projectsWithStats,
			selectedProject: projectPage.selectedProject,
			filters: { ...projectPage.filters, contractQ, listMode, contractField },
			pagination: projectPage.pagination
		};
	};

	const getQuotationDocHubPage = async (params: URLSearchParams) => {
		const projectFilters = parseProjectFilters(params);
		const quotationQ = textParam(params, 'quotationQ');
		const listModeRaw = textParam(params, 'listMode', 'all');
		const quotationFieldRaw = textParam(params, 'quotationField', 'all');
		const listMode = listModeRaw === 'selected' || listModeRaw === 'all' ? listModeRaw : 'all';
		const quotationField =
			quotationFieldRaw === 'id' ||
			quotationFieldRaw === 'amount' ||
			quotationFieldRaw === 'date' ||
			quotationFieldRaw === 'notes' ||
			quotationFieldRaw === 'source' ||
			quotationFieldRaw === 'all'
				? quotationFieldRaw
				: 'all';

		const conditions: SQL[] = [isNull(quotations.deletedAt)];
		if (listMode === 'selected') {
			conditions.push(projectFilters.projectId ? eq(quotations.projectId, projectFilters.projectId) : sql`1 = 0`);
		}
		if (quotationQ) {
			if (quotationField === 'id') conditions.push(like(quotations.id, `%${quotationQ}%`));
			else if (quotationField === 'amount')
				conditions.push(like(sql`cast(coalesce(${quotations.amount}, 0) as text)`, `%${quotationQ}%`));
			else if (quotationField === 'date') conditions.push(like(quotations.date, `%${quotationQ}%`));
			else if (quotationField === 'notes')
				conditions.push(like(sql`coalesce(${quotations.metadata}, '')`, `%${quotationQ}%`));
			else if (quotationField === 'source')
				conditions.push(like(sql`coalesce(${quotations.quotationNumber}, '')`, `%${quotationQ}%`));
			else {
				conditions.push(
					or(
						like(quotations.id, `%${quotationQ}%`),
						like(sql`cast(coalesce(${quotations.amount}, 0) as text)`, `%${quotationQ}%`),
						like(quotations.date, `%${quotationQ}%`),
						like(sql`coalesce(${quotations.quotationNumber}, '')`, `%${quotationQ}%`),
						like(sql`coalesce(${quotations.metadata}, '')`, `%${quotationQ}%`)
					)!
				);
			}
		}

		const quotationRows = await ctx.db
			.select()
			.from(quotations)
			.where(and(...conditions))
			.orderBy(desc(quotations.date), desc(quotations.createdAt));
		const countRows = await ctx.db
			.select({ projectId: quotations.projectId, total: sql<number>`count(*)` })
			.from(quotations)
			.where(isNull(quotations.deletedAt))
			.groupBy(quotations.projectId);
		const projectPage = await getDocHubProjectPicker(
			ctx.db,
			projectFilters,
			countRows,
			quotationRows.map((item) => item.projectId),
			'quotationCount'
		);

		return {
			quotations: quotationRows.map((item) => ({
				...item,
				projectName: item.projectId ? projectPage.projectMap.get(item.projectId) ?? item.projectId : item.projectId,
				fileViewUrl: fileViewUrl(item.fileUrl),
				docMeta: parseDocumentMetadata(item.metadata)
			})),
			projects: projectPage.projectsWithStats,
			selectedProject: projectPage.selectedProject,
			filters: { ...projectPage.filters, quotationQ, listMode, quotationField },
			pagination: projectPage.pagination
		};
	};

	const getPurchaseOrderDocHubPage = async (params: URLSearchParams) => {
		const projectFilters = parseProjectFilters(params);
		const poQ = textParam(params, 'poQ');
		const listModeRaw = textParam(params, 'listMode', 'all');
		const poFieldRaw = textParam(params, 'poField', 'all');
		const listMode = listModeRaw === 'selected' || listModeRaw === 'all' ? listModeRaw : 'all';
		const poField =
			poFieldRaw === 'id' ||
			poFieldRaw === 'poNumber' ||
			poFieldRaw === 'supplier' ||
			poFieldRaw === 'amount' ||
			poFieldRaw === 'date' ||
			poFieldRaw === 'notes' ||
			poFieldRaw === 'all'
				? poFieldRaw
				: 'all';

		const conditions: SQL[] = [isNull(purchaseOrders.deletedAt)];
		if (listMode === 'selected') {
			conditions.push(projectFilters.projectId ? eq(purchaseOrders.projectId, projectFilters.projectId) : sql`1 = 0`);
		}
		if (poQ) {
			if (poField === 'id') conditions.push(like(purchaseOrders.id, `%${poQ}%`));
			else if (poField === 'poNumber') conditions.push(like(purchaseOrders.poNumber, `%${poQ}%`));
			else if (poField === 'supplier')
				conditions.push(like(sql`coalesce(${purchaseOrders.supplierName}, '')`, `%${poQ}%`));
			else if (poField === 'amount')
				conditions.push(like(sql`cast(coalesce(${purchaseOrders.amount}, 0) as text)`, `%${poQ}%`));
			else if (poField === 'date')
				conditions.push(like(sql`coalesce(${purchaseOrders.date}, '')`, `%${poQ}%`));
			else if (poField === 'notes')
				conditions.push(like(sql`coalesce(${purchaseOrders.metadata}, '')`, `%${poQ}%`));
			else {
				conditions.push(
					or(
						like(purchaseOrders.id, `%${poQ}%`),
						like(purchaseOrders.poNumber, `%${poQ}%`),
						like(sql`coalesce(${purchaseOrders.supplierName}, '')`, `%${poQ}%`),
						like(sql`cast(coalesce(${purchaseOrders.amount}, 0) as text)`, `%${poQ}%`),
						like(sql`coalesce(${purchaseOrders.date}, '')`, `%${poQ}%`),
						like(sql`coalesce(${purchaseOrders.metadata}, '')`, `%${poQ}%`)
					)!
				);
			}
		}

		const purchaseOrderRows = await ctx.db
			.select()
			.from(purchaseOrders)
			.where(and(...conditions))
			.orderBy(desc(purchaseOrders.date), desc(purchaseOrders.createdAt));
		const countRows = await ctx.db
			.select({ projectId: purchaseOrders.projectId, total: sql<number>`count(*)` })
			.from(purchaseOrders)
			.where(isNull(purchaseOrders.deletedAt))
			.groupBy(purchaseOrders.projectId);
		const projectPage = await getDocHubProjectPicker(
			ctx.db,
			projectFilters,
			countRows,
			purchaseOrderRows.map((item) => item.projectId),
			'poCount'
		);

		return {
			purchaseOrders: purchaseOrderRows.map((item) => ({
				...item,
				projectName: item.projectId ? projectPage.projectMap.get(item.projectId) ?? item.projectId : item.projectId,
				fileViewUrl: fileViewUrl(item.fileUrl),
				docMeta: parseDocumentMetadata(item.metadata)
			})),
			projects: projectPage.projectsWithStats,
			selectedProject: projectPage.selectedProject,
			filters: { ...projectPage.filters, poQ, listMode, poField },
			pagination: projectPage.pagination
		};
	};

	const getContractDocumentDetail = async (projectId: string, contractId: string) => {
		const contract = await documentRepository.findContractById(projectId, contractId);
		if (!contract) return null;

		const docMeta = parseDocumentMetadata(contract.metadata);
		const { fileViewUrl, fileDownloadUrl } = r2FileUrls(contract.fileUrl);
		return { contract, docMeta, fileViewUrl, fileDownloadUrl };
	};

	const updateContractDocument = async (
		projectId: string,
		contractId: string,
		data: { amount: number; currency: string; date: string; notes: string }
	) => {
		const [current] = await ctx.db
			.select({ metadata: contracts.metadata })
			.from(contracts)
			.where(and(eq(contracts.id, contractId), eq(contracts.projectId, projectId), isNull(contracts.deletedAt)))
			.limit(1);

		const metadata = buildDocumentMetadata({
			raw: current?.metadata ?? null,
			notes: data.notes || undefined
		});

		await ctx.db
			.update(contracts)
			.set({
				amount: Number.isFinite(data.amount) ? data.amount : 0,
				currency: data.currency,
				effectiveDate: data.date || null,
				metadata,
				updatedAt: nowIso()
			})
			.where(and(eq(contracts.id, contractId), eq(contracts.projectId, projectId), isNull(contracts.deletedAt)));
	};

	const deleteContractDocument = async (projectId: string, contractId: string) => {
		const now = nowIso();
		await ctx.db
			.update(contracts)
			.set({ deletedAt: now, updatedAt: now })
			.where(and(eq(contracts.id, contractId), eq(contracts.projectId, projectId), isNull(contracts.deletedAt)));
	};

	const getQuotationDocumentDetail = async (projectId: string, quotationId: string) => {
		const quotation = await documentRepository.findQuotationById(projectId, quotationId);
		if (!quotation) return null;

		const docMeta = parseDocumentMetadata(quotation.metadata);
		const { fileViewUrl, fileDownloadUrl } = r2FileUrls(quotation.fileUrl);
		return { quotation, docMeta, fileViewUrl, fileDownloadUrl };
	};

	const updateQuotationDocument = async (
		projectId: string,
		quotationId: string,
		data: { quotationNumber: string; amount: number; currency: string; date: string; notes: string }
	) => {
		const [current] = await ctx.db
			.select({ metadata: quotations.metadata })
			.from(quotations)
			.where(
				and(eq(quotations.id, quotationId), eq(quotations.projectId, projectId), isNull(quotations.deletedAt))
			)
			.limit(1);

		const metadata = buildDocumentMetadata({
			raw: current?.metadata ?? null,
			notes: data.notes || undefined
		});

		await ctx.db
			.update(quotations)
			.set({
				quotationNumber: data.quotationNumber || null,
				amount: Number.isFinite(data.amount) ? data.amount : 0,
				currency: data.currency,
				date: data.date || null,
				metadata,
				updatedAt: nowIso()
			})
			.where(
				and(eq(quotations.id, quotationId), eq(quotations.projectId, projectId), isNull(quotations.deletedAt))
			);
	};

	const deleteQuotationDocument = async (projectId: string, quotationId: string) => {
		const now = nowIso();
		await ctx.db
			.update(quotations)
			.set({ deletedAt: now, updatedAt: now })
			.where(
				and(eq(quotations.id, quotationId), eq(quotations.projectId, projectId), isNull(quotations.deletedAt))
			);
	};

	const getPurchaseOrderDocumentDetail = async (
		projectId: string,
		purchaseOrderId: string
	) => {
		const purchaseOrder = await documentRepository.findPurchaseOrderById(projectId, purchaseOrderId);
		if (!purchaseOrder) return null;

		const docMeta = parseDocumentMetadata(purchaseOrder.metadata);
		const { fileViewUrl, fileDownloadUrl } = r2FileUrls(purchaseOrder.fileUrl);
		return { purchaseOrder, docMeta, fileViewUrl, fileDownloadUrl };
	};

	const updatePurchaseOrderDocument = async (
		projectId: string,
		purchaseOrderId: string,
		data: {
			poNumber: string;
			supplierName: string;
			amount: number;
			currency: string;
			date: string;
			notes: string;
		}
	) => {
		const [current] = await ctx.db
			.select({ metadata: purchaseOrders.metadata })
			.from(purchaseOrders)
			.where(
				and(
					eq(purchaseOrders.id, purchaseOrderId),
					eq(purchaseOrders.projectId, projectId),
					isNull(purchaseOrders.deletedAt)
				)
			)
			.limit(1);

		const metadata = buildDocumentMetadata({
			raw: current?.metadata ?? null,
			notes: data.notes || undefined
		});

		await ctx.db
			.update(purchaseOrders)
			.set({
				poNumber: data.poNumber,
				supplierName: data.supplierName,
				amount: Number.isFinite(data.amount) ? data.amount : 0,
				currency: data.currency,
				date: data.date || null,
				metadata,
				updatedAt: nowIso()
			})
			.where(
				and(
					eq(purchaseOrders.id, purchaseOrderId),
					eq(purchaseOrders.projectId, projectId),
					isNull(purchaseOrders.deletedAt)
				)
			);
	};

	const deletePurchaseOrderDocument = async (projectId: string, purchaseOrderId: string) => {
		const now = nowIso();
		await ctx.db
			.update(purchaseOrders)
			.set({ deletedAt: now, updatedAt: now })
			.where(
				and(
					eq(purchaseOrders.id, purchaseOrderId),
					eq(purchaseOrders.projectId, projectId),
					isNull(purchaseOrders.deletedAt)
				)
			);
	};

	return {
		getContractDocHubPage,
		getQuotationDocHubPage,
		getPurchaseOrderDocHubPage,
		getContractDocumentDetail,
		updateContractDocument,
		deleteContractDocument,
		getQuotationDocumentDetail,
		updateQuotationDocument,
		deleteQuotationDocument,
		getPurchaseOrderDocumentDetail,
		updatePurchaseOrderDocument,
		deletePurchaseOrderDocument
	};
}

export type FinanceDocumentsApi = ReturnType<typeof createFinanceDocumentApi>;
