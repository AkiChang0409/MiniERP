import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { resolveSgdEquivalentForWrite } from '$modules/finance/services/fx/resolve-sgd-equivalent';
import { parseDocumentMetadata } from '$modules/finance/schemas/document-metadata';
import { resolveExpenseFilePreview } from '$modules/finance/services/expense-file-preview';
import type { ModuleContext } from '$platform/modules/types';
import { AuditService } from '$platform/audit/audit-service';
import { businessPartners, projects, revenue } from '../../../infrastructure/db/schema';
import { listFinanceProjectNames } from '../integrations';
import { RevenueRepository } from '../repositories';

type FinanceRevenueCreateInput = {
	projectId?: string | null;
	invoiceType: 'standard' | 'zero_rate' | 'tax_invoice' | 'exempt' | 'out_of_scope';
	invoiceNumber?: string | null;
	clientName?: string | null;
	date: string;
	amount: number;
	currency?: string;
	gstAmount?: number;
	gstCode?: 'SR' | 'ZR' | 'ES' | 'OP' | null;
	documentRef?: string | null;
	metadata?: string | null;
	notes?: string | null;
};

type CustomerInvoiceProjectRow = {
	id: string;
	name: string;
	customerId: string | null;
	customerName: string | null;
	customerAddress: string | null;
	customerContact: string | null;
	customerCurrency: string | null;
	customerGstRegNo: string | null;
};

function buildRevenueTotals<
	TRow extends { invoiceType: string | null; amount: number | null; sgdEquivalent: number | null }
>(rows: TRow[]) {
	return rows.reduce(
		(acc, row) => {
			const amount = row.sgdEquivalent ?? row.amount ?? 0;
			acc.total += amount;
			if (row.invoiceType === 'zero_rate') acc.zeroRate += amount;
			else acc.standardRated += amount;
			return acc;
		},
		{ total: 0, standardRated: 0, zeroRate: 0 }
	);
}

function hasRevenueAttachment(documentRef: string | null) {
	return Boolean(documentRef && !documentRef.startsWith('manual://'));
}

export function createFinanceRevenueApi(ctx: ModuleContext) {
	const revenueRepository = new RevenueRepository(ctx.db);
	const audit = new AuditService(ctx);

	const getProjectRevenuePage = async (projectId: string) => {
		const revenueRecords = await revenueRepository.findByProject(projectId);

		// Wave 2.1d: invoicesOut table dropped; emit empty for legacy callers expecting it.
		const invoices: Array<{
			id: string;
			invoiceNo: string;
			date: string | null;
			dueDate: string | null;
			currency: string;
			subtotal: number | null;
			gstType: string | null;
			gstAmount: number | null;
			total: number | null;
			status: string | null;
		}> = [];

		const revenueTotal = await revenueRepository.getProjectRevenueTotal(projectId);
		return {
			revenueRecords,
			invoices,
			totals: {
				total: revenueTotal,
				revenue: revenueTotal,
				invoiced: revenueTotal
			}
		};
	};

	const getRevenueListPage = async () => {
		const revenueRows = await ctx.db
			.select({
				id: revenue.id,
				projectId: revenue.projectId,
				invoiceType: revenue.invoiceType,
				invoiceNumber: revenue.invoiceNumber,
				clientName: revenue.clientName,
				date: revenue.date,
				amount: revenue.amount,
				currency: revenue.currency,
				sgdEquivalent: revenue.sgdEquivalent,
				gstAmount: revenue.gstAmount,
				documentRef: revenue.documentRef,
				notes: revenue.notes,
				createdAt: revenue.createdAt
			})
			.from(revenue)
			.where(isNull(revenue.deletedAt))
			.orderBy(desc(revenue.date), desc(revenue.createdAt));

		const projectIds = [
			...new Set(
				revenueRows
					.map((row) => row.projectId)
					.filter((projectId): projectId is string => Boolean(projectId))
			)
		];
		const projectNameById = await listFinanceProjectNames(ctx.db, projectIds);

		return {
			revenueRecords: revenueRows.map((row) => ({
				...row,
				projectName: row.projectId ? projectNameById.get(row.projectId) ?? null : null,
				hasAttachment: hasRevenueAttachment(row.documentRef)
			})),
			totals: buildRevenueTotals(revenueRows)
		};
	};

	const getCustomerInvoiceGeneratePage = async (preselectProjectId = '') => {
		const projectRows: CustomerInvoiceProjectRow[] = await ctx.db
			.select({
				id: projects.id,
				name: projects.name,
				customerId: projects.businessPartnerId,
				customerName: businessPartners.name,
				customerAddress: businessPartners.address,
				customerContact: businessPartners.contact,
				customerCurrency: businessPartners.currency,
				customerGstRegNo: businessPartners.gstRegNo
			})
			.from(projects)
			.leftJoin(businessPartners, eq(projects.businessPartnerId, businessPartners.id))
			.where(isNull(projects.deletedAt))
			.orderBy(asc(projects.name))
			.limit(500);

		return {
			projects: projectRows,
			preselectProjectId: projectRows.some((project) => project.id === preselectProjectId)
				? preselectProjectId
				: projectRows[0]?.id ?? ''
		};
	};

	const createRevenue = async (data: FinanceRevenueCreateInput) => {
		const currency = (data.currency ?? 'SGD').trim().toUpperCase();
		const sgdEquivalent = await resolveSgdEquivalentForWrite({
			amount: data.amount,
			currency,
			dateYmd: data.date
		});

		const row = await revenueRepository.create({
			...data,
			currency,
			sgdEquivalent,
			gstAmount: data.gstAmount ?? 0,
			gstCode: data.gstCode ?? null
		});

		await audit.writeLog({
			action: 'revenue.created',
			entityType: 'revenue',
			entityId: row.id,
			projectId: data.projectId ?? undefined,
			metadata: {
				amount: data.amount,
				currency,
				invoiceType: data.invoiceType,
				clientName: data.clientName
			}
		});

		return row;
	};

	const getProjectRevenueDocumentDetail = async (projectId: string, revenueId: string) => {
		const [revenueRecord] = await ctx.db
			.select()
			.from(revenue)
			.where(
				and(eq(revenue.id, revenueId), eq(revenue.projectId, projectId), isNull(revenue.deletedAt))
			)
			.limit(1);

		if (!revenueRecord) return null;

		const docMeta = parseDocumentMetadata(revenueRecord.metadata ?? null);
		const { fileViewUrl, fileDownloadUrl, previewDisplay } = await resolveExpenseFilePreview(
			ctx.db,
			revenueRecord.documentRef,
			docMeta
		);

		return { revenue: revenueRecord, docMeta, fileViewUrl, fileDownloadUrl, previewDisplay };
	};

	return {
		getProjectRevenuePage,
		getRevenueListPage,
		getCustomerInvoiceGeneratePage,
		createRevenue,
		getProjectRevenueDocumentDetail
	};
}

export type FinanceRevenueApi = ReturnType<typeof createFinanceRevenueApi>;
