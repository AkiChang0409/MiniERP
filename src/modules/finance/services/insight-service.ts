import { and, between, desc, eq, inArray, isNull, not, or, sql } from 'drizzle-orm';
import { effectiveAmountSgd } from '$modules/finance/services/fx/effective-amount-sgd';
import { parseDocumentMetadata } from '$modules/finance/schemas/document-metadata';
import type { ModuleContext } from '$platform/modules/types';
import {
	compensationComponents,
	contracts,
	documents,
	expenses,
	payoutRecords,
	projects,
	purchaseOrders,
	quotations,
	revenue
} from '../../../infrastructure/db/schema';
import {
	expenseSgdAmountExpr,
	projectExpenseOpexSumExpr,
	projectExpenseSalesCostSumExpr,
	projectExpenseTotalSumExpr,
	projectRevenueTotalSumExpr,
	revenueSgdAmountExpr,
	staffCostPeriodBetween,
	staffCostPayoutJoinConditions,
	staffCostSumExpr
} from '../repositories';

export interface DashboardOverviewRangeInput {
	from?: string | null;
	to?: string | null;
	now?: Date;
}

export interface DashboardChartsInput extends DashboardOverviewRangeInput {
	projectStatus?: string | null;
}

export interface ProjectsProfitInput extends DashboardOverviewRangeInput {
	projectId?: string | null;
	projectStatus?: string | null;
}

function isIsoDate(value: string) {
	return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function pad(value: number) {
	return value.toString().padStart(2, '0');
}

function quarterRange(year: number, quarter: number) {
	const startMonth = (quarter - 1) * 3;
	const start = new Date(Date.UTC(year, startMonth, 1));
	const end = new Date(Date.UTC(year, startMonth + 3, 0));
	return {
		start: `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}`,
		end: `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`
	};
}

function shiftQuarter(year: number, quarter: number, delta: number) {
	let y = year;
	let q = quarter + delta;
	while (q <= 0) {
		q += 4;
		y -= 1;
	}
	while (q > 4) {
		q -= 4;
		y += 1;
	}
	return { year: y, quarter: q };
}

function getQuarterKey(dateIso: string) {
	if (!isIsoDate(dateIso)) return '';
	const dt = new Date(`${dateIso}T00:00:00Z`);
	const q = Math.floor(dt.getUTCMonth() / 3) + 1;
	return `${dt.getUTCFullYear()}-Q${q}`;
}

function csvEscape(value: string | number) {
	const text = String(value ?? '');
	if (text.includes(',') || text.includes('"') || text.includes('\n')) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

function referenceFileLabel(fileUrl: string | null | undefined, metadata: string | null | undefined) {
	const parsed = parseDocumentMetadata(metadata ?? null);
	if (parsed.upload?.fileName?.trim()) return parsed.upload.fileName.trim();
	if (!fileUrl) return '-';
	const pathOnly = fileUrl.split('?')[0];
	const tail = pathOnly.split('/').pop() ?? '';
	try {
		const decoded = decodeURIComponent(tail);
		if (decoded) return decoded;
	} catch {
		/* ignore malformed URL encoding */
	}
	return tail || fileUrl;
}

function friendlyDocNumber(primary: string | null | undefined, id: string) {
	const trimmed = primary?.trim();
	if (trimmed) return trimmed;
	return id.length > 14 ? `${id.slice(0, 8)}...` : id;
}

function referenceNameFromDocumentRef(documentRef: string | null) {
	if (!documentRef || documentRef.startsWith('manual://')) return null;
	const tail = documentRef.split('/').pop() ?? documentRef;
	try {
		return decodeURIComponent(tail) || tail;
	} catch {
		return tail;
	}
}

export function createFinanceInsightApi(ctx: ModuleContext) {
	const getCompanyFinancialOverview = async (input: DashboardOverviewRangeInput = {}) => {
		const from = input.from ?? '';
		const to = input.to ?? '';

		const end = input.now ? new Date(input.now) : new Date();
		const start = new Date(end);
		start.setUTCDate(start.getUTCDate() - 29);

		const hasCustomRange = isIsoDate(from) && isIsoDate(to) && from <= to;
		const current = hasCustomRange
			? { start: from, end: to }
			: {
					start: start.toISOString().slice(0, 10),
					end: end.toISOString().slice(0, 10)
				};

		const currentStart = new Date(`${current.start}T00:00:00Z`);
		const currentEnd = new Date(`${current.end}T00:00:00Z`);
		const spanDays =
			Math.max(
				1,
				Math.floor((currentEnd.getTime() - currentStart.getTime()) / (24 * 60 * 60 * 1000)) + 1
			) || 30;

		const prevStart = new Date(currentStart);
		prevStart.setUTCDate(prevStart.getUTCDate() - spanDays);
		const prevEnd = new Date(currentStart);
		prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);

		const previous = {
			start: prevStart.toISOString().slice(0, 10),
			end: prevEnd.toISOString().slice(0, 10)
		};

		const [income] = await ctx.db
			.select({ total: projectRevenueTotalSumExpr() })
			.from(revenue)
			.where(and(between(revenue.date, current.start, current.end), isNull(revenue.deletedAt)));
		const [supplierCost] = await ctx.db
			.select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)` })
			.from(expenses)
			.where(
				and(
					eq(expenses.expenseType, 'sales_cost'),
					between(expenses.date, current.start, current.end),
					isNull(expenses.deletedAt)
				)
			);
		const [staffCost] = await ctx.db
			.select({ total: staffCostSumExpr() })
			.from(payoutRecords)
			.innerJoin(compensationComponents, eq(payoutRecords.componentId, compensationComponents.id))
			.where(and(staffCostPeriodBetween(current.start, current.end), staffCostPayoutJoinConditions()));
		const [expenseCost] = await ctx.db
			.select({ total: projectExpenseTotalSumExpr() })
			.from(expenses)
			.where(and(between(expenses.date, current.start, current.end), isNull(expenses.deletedAt)));

		const [prevIncome] = await ctx.db
			.select({ total: projectRevenueTotalSumExpr() })
			.from(revenue)
			.where(and(between(revenue.date, previous.start, previous.end), isNull(revenue.deletedAt)));
		const [prevSupplierCost] = await ctx.db
			.select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)` })
			.from(expenses)
			.where(
				and(
					eq(expenses.expenseType, 'sales_cost'),
					between(expenses.date, previous.start, previous.end),
					isNull(expenses.deletedAt)
				)
			);
		const [prevStaffCost] = await ctx.db
			.select({ total: staffCostSumExpr() })
			.from(payoutRecords)
			.innerJoin(compensationComponents, eq(payoutRecords.componentId, compensationComponents.id))
			.where(and(staffCostPeriodBetween(previous.start, previous.end), staffCostPayoutJoinConditions()));
		const [prevExpenseCost] = await ctx.db
			.select({ total: projectExpenseTotalSumExpr() })
			.from(expenses)
			.where(and(between(expenses.date, previous.start, previous.end), isNull(expenses.deletedAt)));

		const [revenueItems, supplierItems, staffItems, expenseItems] = await Promise.all([
			ctx.db
				.select({
					id: revenue.id,
					date: revenue.date,
					ref: sql<string>`coalesce(${revenue.invoiceNumber}, ${revenue.id})`,
					note: sql<string>`'completed'`,
					amount: revenueSgdAmountExpr()
				})
				.from(revenue)
				.where(and(between(revenue.date, current.start, current.end), isNull(revenue.deletedAt)))
				.orderBy(desc(revenue.date), desc(revenue.createdAt)),
			ctx.db
				.select({
					id: expenses.id,
					date: expenses.date,
					ref: sql<string>`coalesce(${expenses.vendorOrSupplier}, ${expenses.id})`,
					note: sql<string>`'sales_cost'`,
					amount: expenses.amount
				})
				.from(expenses)
				.where(
					and(
						eq(expenses.expenseType, 'sales_cost'),
						between(expenses.date, current.start, current.end),
						isNull(expenses.deletedAt)
					)
				)
				.orderBy(desc(expenses.date), desc(expenses.createdAt)),
			ctx.db
				.select({
					id: payoutRecords.id,
					date: payoutRecords.period,
					ref: compensationComponents.incomeType,
					note: payoutRecords.note,
					amount: payoutRecords.computedAmount
				})
				.from(payoutRecords)
				.innerJoin(compensationComponents, eq(payoutRecords.componentId, compensationComponents.id))
				.where(and(staffCostPeriodBetween(current.start, current.end), staffCostPayoutJoinConditions()))
				.orderBy(desc(payoutRecords.period), desc(payoutRecords.createdAt)),
			ctx.db
				.select({
					id: expenses.id,
					date: expenses.date,
					ref: expenses.category,
					note: expenses.notes,
					amount: expenseSgdAmountExpr()
				})
				.from(expenses)
				.where(and(between(expenses.date, current.start, current.end), isNull(expenses.deletedAt)))
				.orderBy(desc(expenses.date), desc(expenses.createdAt))
		]);

		const revenueValue = income?.total ?? 0;
		const totalExpense = (supplierCost?.total ?? 0) + (staffCost?.total ?? 0) + (expenseCost?.total ?? 0);
		const prevRevenue = prevIncome?.total ?? 0;
		const prevExpense =
			(prevSupplierCost?.total ?? 0) + (prevStaffCost?.total ?? 0) + (prevExpenseCost?.total ?? 0);
		const prevNetProfit = prevRevenue - prevExpense;
		const netProfit = revenueValue - totalExpense;
		const normalizedRevenueItems = revenueItems.map((item) => ({
			...item,
			date: item.date ?? '',
			ref: item.ref ?? item.id,
			note: item.note ?? '',
			amount: Number(item.amount ?? 0)
		}));
		const normalizedExpenseItems = [
			...supplierItems.map((item) => ({
				...item,
				source: 'supplier_invoice',
				date: item.date ?? '',
				ref: item.ref ?? item.id,
				note: item.note ?? '',
				amount: Number(item.amount ?? 0)
			})),
			...staffItems.map((item) => ({
				...item,
				source: 'staff_cost',
				date: item.date ?? '',
				ref: item.ref ?? item.id,
				note: item.note ?? '',
				amount: Number(item.amount ?? 0)
			})),
			...expenseItems.map((item) => ({
				...item,
				source: 'expense',
				date: item.date ?? '',
				ref: item.ref ?? item.id,
				note: item.note ?? '',
				amount: Number(item.amount ?? 0)
			}))
		].sort((a, b) => b.date.localeCompare(a.date));

		return {
			revenue: revenueValue,
			expense: totalExpense,
			netProfit,
			pendingReceivable: 0,
			pendingPayable: 0,
			range: current,
			previousRange: previous,
			trend: {
				revenueDelta: revenueValue - prevRevenue,
				expenseDelta: totalExpense - prevExpense,
				netProfitDelta: netProfit - prevNetProfit
			},
			details: {
				revenueItems: normalizedRevenueItems,
				expenseItems: normalizedExpenseItems
			}
		};
	};

	const getDashboardCharts = async (input: DashboardChartsInput = {}) => {
		const projectStatus = input.projectStatus ?? '';
		const from = input.from ?? '';
		const to = input.to ?? '';

		const now = input.now ? new Date(input.now) : new Date();
		const defaultEnd = now.toISOString().slice(0, 10);
		const defaultStartDt = new Date(now);
		defaultStartDt.setUTCDate(defaultStartDt.getUTCDate() - 29);
		const defaultStart = defaultStartDt.toISOString().slice(0, 10);
		const hasRange = isIsoDate(from) && isIsoDate(to) && from <= to;
		const current = hasRange ? { start: from, end: to } : { start: defaultStart, end: defaultEnd };

		const projectConditions = [isNull(projects.deletedAt)];
		if (projectStatus) projectConditions.push(eq(projects.status, projectStatus));
		const projectRows = await ctx.db
			.select({ id: projects.id, name: projects.name })
			.from(projects)
			.where(and(...projectConditions));
		const projectIds = projectRows.map((item) => item.id);

		if (projectIds.length === 0) {
			return {
				pie: { supplierCost: 0, staffCost: 0, expenseCost: 0 },
				quarterly: [],
				projectBars: []
			};
		}

		const baseRevenueRange = [isNull(revenue.deletedAt), inArray(revenue.projectId, projectIds)];
		const baseStaffRange = [
			isNull(payoutRecords.deletedAt),
			inArray(payoutRecords.projectId, projectIds),
			staffCostPayoutJoinConditions()
		];
		const baseExpenseRange = [isNull(expenses.deletedAt), inArray(expenses.projectId, projectIds)];
		const baseSupplierRange = [
			...baseExpenseRange,
			eq(expenses.expenseType, 'sales_cost')
		];

		const [supplierCostSum, staffCostSum, expenseCostSum] = await Promise.all([
			ctx.db
				.select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)` })
				.from(expenses)
				.where(and(...baseSupplierRange, between(expenses.date, current.start, current.end))),
			ctx.db
				.select({ total: staffCostSumExpr() })
				.from(payoutRecords)
				.innerJoin(compensationComponents, eq(payoutRecords.componentId, compensationComponents.id))
				.where(and(...baseStaffRange, staffCostPeriodBetween(current.start, current.end))),
			ctx.db
				.select({ total: projectExpenseTotalSumExpr() })
				.from(expenses)
				.where(and(...baseExpenseRange, between(expenses.date, current.start, current.end)))
		]);

		const anchorDate = hasRange ? new Date(`${to}T00:00:00Z`) : now;
		const anchorYear = anchorDate.getUTCFullYear();
		const anchorQuarter = Math.floor(anchorDate.getUTCMonth() / 3) + 1;
		const quarterPoints = [3, 2, 1, 0].map((shift) => {
			const q = shiftQuarter(anchorYear, anchorQuarter, -shift);
			const range = quarterRange(q.year, q.quarter);
			return {
				key: `${q.year}-Q${q.quarter}`,
				label: `${q.year} Q${q.quarter}`,
				start: range.start,
				end: range.end,
				revenue: 0,
				expense: 0
			};
		});

		const quarterMap = new Map(quarterPoints.map((item) => [item.key, item]));
		const quarterStart = quarterPoints[0]?.start ?? current.start;
		const quarterEnd = quarterPoints[quarterPoints.length - 1]?.end ?? current.end;

		const [revenueRows, supplierRows, staffRows, expenseRows] = await Promise.all([
			ctx.db
				.select({
					date: revenue.date,
					projectId: revenue.projectId,
					amount: revenueSgdAmountExpr()
				})
				.from(revenue)
				.where(and(...baseRevenueRange, between(revenue.date, quarterStart, quarterEnd))),
			ctx.db
				.select({
					date: expenses.date,
					projectId: expenses.projectId,
					amount: expenses.amount
				})
				.from(expenses)
				.where(and(...baseSupplierRange, between(expenses.date, quarterStart, quarterEnd))),
			ctx.db
				.select({
					date: payoutRecords.period,
					projectId: payoutRecords.projectId,
					amount: payoutRecords.computedAmount
				})
				.from(payoutRecords)
				.innerJoin(compensationComponents, eq(payoutRecords.componentId, compensationComponents.id))
				.where(and(...baseStaffRange, staffCostPeriodBetween(quarterStart, quarterEnd))),
			ctx.db
				.select({
					date: expenses.date,
					projectId: expenses.projectId,
					amount: expenseSgdAmountExpr()
				})
				.from(expenses)
				.where(and(...baseExpenseRange, between(expenses.date, quarterStart, quarterEnd)))
		]);

		for (const row of revenueRows) {
			const key = getQuarterKey(row.date ?? '');
			const item = quarterMap.get(key);
			if (item) item.revenue += Number(row.amount ?? 0);
		}
		for (const row of supplierRows) {
			const key = getQuarterKey(row.date ?? '');
			const item = quarterMap.get(key);
			if (item) item.expense += Number(row.amount ?? 0);
		}
		for (const row of staffRows) {
			const key = getQuarterKey(row.date ?? '');
			const item = quarterMap.get(key);
			if (item) item.expense += Number(row.amount ?? 0);
		}
		for (const row of expenseRows) {
			const key = getQuarterKey(row.date ?? '');
			const item = quarterMap.get(key);
			if (item) item.expense += Number(row.amount ?? 0);
		}

		const projectRevenue = new Map<string, number>();
		const projectCost = new Map<string, number>();

		const [rangeRevenueRows, rangeSupplierRows, rangeStaffRows, rangeExpenseRows] = await Promise.all([
			ctx.db
				.select({
					projectId: revenue.projectId,
					total: projectRevenueTotalSumExpr()
				})
				.from(revenue)
				.where(and(...baseRevenueRange, between(revenue.date, current.start, current.end)))
				.groupBy(revenue.projectId),
			ctx.db
				.select({
					projectId: expenses.projectId,
					total: sql<number>`coalesce(sum(${expenses.amount}), 0)`
				})
				.from(expenses)
				.where(and(...baseSupplierRange, between(expenses.date, current.start, current.end)))
				.groupBy(expenses.projectId),
			ctx.db
				.select({
					projectId: payoutRecords.projectId,
					total: staffCostSumExpr()
				})
				.from(payoutRecords)
				.innerJoin(compensationComponents, eq(payoutRecords.componentId, compensationComponents.id))
				.where(and(...baseStaffRange, staffCostPeriodBetween(current.start, current.end)))
				.groupBy(payoutRecords.projectId),
			ctx.db
				.select({
					projectId: expenses.projectId,
					total: projectExpenseTotalSumExpr()
				})
				.from(expenses)
				.where(and(...baseExpenseRange, between(expenses.date, current.start, current.end)))
				.groupBy(expenses.projectId)
		]);

		for (const row of rangeRevenueRows) {
			if (!row.projectId) continue;
			projectRevenue.set(row.projectId, Number(row.total ?? 0));
		}
		for (const row of rangeSupplierRows) {
			if (!row.projectId) continue;
			projectCost.set(row.projectId, (projectCost.get(row.projectId) ?? 0) + Number(row.total ?? 0));
		}
		for (const row of rangeStaffRows) {
			if (!row.projectId) continue;
			projectCost.set(row.projectId, (projectCost.get(row.projectId) ?? 0) + Number(row.total ?? 0));
		}
		for (const row of rangeExpenseRows) {
			if (!row.projectId) continue;
			projectCost.set(row.projectId, (projectCost.get(row.projectId) ?? 0) + Number(row.total ?? 0));
		}

		const projectBars = projectRows
			.map((project) => ({
				projectId: project.id,
				projectName: project.name,
				revenue: projectRevenue.get(project.id) ?? 0,
				expense: projectCost.get(project.id) ?? 0
			}))
			.filter((item) => item.revenue > 0 || item.expense > 0)
			.sort((a, b) => b.revenue - a.revenue)
			.slice(0, 8);

		return {
			pie: {
				supplierCost: Number(supplierCostSum[0]?.total ?? 0),
				staffCost: Number(staffCostSum[0]?.total ?? 0),
				expenseCost: Number(expenseCostSum[0]?.total ?? 0)
			},
			quarterly: quarterPoints.map((item) => ({
				label: item.label,
				revenue: item.revenue,
				expense: item.expense
			})),
			projectBars
		};
	};

	const getProjectsProfitRanking = async (input: ProjectsProfitInput = {}) => {
		const projectId = input.projectId ?? '';
		const projectStatus = input.projectStatus ?? '';
		const from = input.from ?? '';
		const to = input.to ?? '';
		const hasRange = isIsoDate(from) && isIsoDate(to) && from <= to;
		const projectConditions = [isNull(projects.deletedAt)];
		if (projectId) projectConditions.push(eq(projects.id, projectId));
		if (projectStatus) projectConditions.push(eq(projects.status, projectStatus));

		const projectRows = await ctx.db
			.select({
				projectId: projects.id,
				projectName: projects.name,
				projectStatus: projects.status
			})
			.from(projects)
			.where(and(...projectConditions));

		if (projectRows.length === 0) {
			return [];
		}

		const revenueConditions = [isNull(revenue.deletedAt)];
		if (hasRange) revenueConditions.push(sql`${revenue.date} between ${from} and ${to}`);
		const revenueRows = await ctx.db
			.select({
				projectId: revenue.projectId,
				total: projectRevenueTotalSumExpr()
			})
			.from(revenue)
			.where(and(...revenueConditions))
			.groupBy(revenue.projectId);

		const purchaseConditions = [
			isNull(expenses.deletedAt),
			eq(expenses.expenseType, 'sales_cost')
		];
		if (hasRange) purchaseConditions.push(sql`${expenses.date} between ${from} and ${to}`);
		const purchaseRows = await ctx.db
			.select({
				projectId: expenses.projectId,
				total: sql<number>`coalesce(sum(${expenses.amount}), 0)`
			})
			.from(expenses)
			.where(and(...purchaseConditions))
			.groupBy(expenses.projectId);

		const staffConditions = [isNull(payoutRecords.deletedAt), staffCostPayoutJoinConditions()];
		if (hasRange) staffConditions.push(staffCostPeriodBetween(from, to));
		const staffRows = await ctx.db
			.select({
				projectId: payoutRecords.projectId,
				total: staffCostSumExpr()
			})
			.from(payoutRecords)
			.innerJoin(compensationComponents, eq(payoutRecords.componentId, compensationComponents.id))
			.where(and(...staffConditions))
			.groupBy(payoutRecords.projectId);

		const expenseConditions = [isNull(expenses.deletedAt)];
		if (hasRange) expenseConditions.push(sql`${expenses.date} between ${from} and ${to}`);
		const expenseRows = await ctx.db
			.select({
				projectId: expenses.projectId,
				total: projectExpenseTotalSumExpr()
			})
			.from(expenses)
			.where(and(...expenseConditions))
			.groupBy(expenses.projectId);

		const revenueMap = new Map(revenueRows.map((row) => [row.projectId, Number(row.total ?? 0)]));
		const purchaseMap = new Map(purchaseRows.map((row) => [row.projectId, Number(row.total ?? 0)]));
		const staffMap = new Map(staffRows.map((row) => [row.projectId, Number(row.total ?? 0)]));
		const expenseMap = new Map(expenseRows.map((row) => [row.projectId, Number(row.total ?? 0)]));

		return projectRows
			.map((project) => {
				const revenueValue = revenueMap.get(project.projectId) ?? 0;
				const purchaseCost = purchaseMap.get(project.projectId) ?? 0;
				const staffCost = staffMap.get(project.projectId) ?? 0;
				const expenseCost = expenseMap.get(project.projectId) ?? 0;
				const cost = purchaseCost + staffCost + expenseCost;
				const profit = revenueValue - cost;
				return {
					projectId: project.projectId,
					projectName: project.projectName,
					projectStatus: project.projectStatus,
					revenue: revenueValue,
					cost,
					profit,
					profitMargin: revenueValue > 0 ? profit / revenueValue : 0
				};
			})
			.sort((a, b) => b.profit - a.profit);
	};

	const getProjectsProfitCsv = async (input: ProjectsProfitInput = {}) => {
		const projectId = input.projectId ?? '';
		const projectStatus = input.projectStatus ?? '';
		const from = input.from ?? '';
		const to = input.to ?? '';
		const hasRange = isIsoDate(from) && isIsoDate(to) && from <= to;
		const dateOutClause = hasRange ? sql` and io.date between ${from} and ${to}` : sql``;
		const dateInClause = hasRange ? sql` and ii.invoice_date between ${from} and ${to}` : sql``;
		const datePrClause = hasRange ? sql` and pr.period between ${from} and ${to}` : sql``;
		const dateExClause = hasRange ? sql` and ex.date between ${from} and ${to}` : sql``;

		const projectConditions = [isNull(projects.deletedAt)];
		if (projectId) projectConditions.push(eq(projects.id, projectId));
		if (projectStatus) projectConditions.push(eq(projects.status, projectStatus));

		const rows = await ctx.db
			.select({
				projectId: projects.id,
				projectName: projects.name,
				projectStatus: projects.status,
				revenue: sql<number>`coalesce((select sum(io.total) from invoices_out io where io.project_id = ${projects.id} and io.deleted_at is null ${dateOutClause}), 0)`,
				purchaseCost: sql<number>`coalesce((select sum(ii.amount) from invoices_in ii where ii.project_id = ${projects.id} and ii.deleted_at is null ${dateInClause}), 0)`,
				staffCost: sql<number>`coalesce((select sum(pr.computed_amount) from payout_records pr inner join compensation_components cc on cc.id = pr.component_id and cc.deleted_at is null where pr.project_id = ${projects.id} and pr.deleted_at is null and pr.status in ('confirmed','paid') and cc.income_type != 'dividend' ${datePrClause}), 0)`,
				expenseCost: sql<number>`coalesce((select sum(ex.amount) from expenses ex where ex.project_id = ${projects.id} and ex.deleted_at is null ${dateExClause}), 0)`
			})
			.from(projects)
			.where(and(...projectConditions));

		const header = ['project_id', 'project_name', 'status', 'revenue', 'cost', 'profit', 'profit_margin'];
		const lines = rows.map((row) => {
			const revenueValue = Number(row.revenue ?? 0);
			const cost =
				Number(row.purchaseCost ?? 0) + Number(row.staffCost ?? 0) + Number(row.expenseCost ?? 0);
			const profit = revenueValue - cost;
			const margin = revenueValue > 0 ? profit / revenueValue : 0;
			return [
				csvEscape(row.projectId),
				csvEscape(row.projectName),
				csvEscape(row.projectStatus),
				csvEscape(revenueValue.toFixed(2)),
				csvEscape(cost.toFixed(2)),
				csvEscape(profit.toFixed(2)),
				csvEscape(margin.toFixed(6))
			].join(',');
		});

		return [header.join(','), ...lines].join('\n');
	};

	const getProjectDocumentsSummary = async (projectId: string) => {
		const referenceDocs = await ctx.db
			.select({
				id: documents.id,
				fileName: documents.fileName,
				fileType: documents.fileType,
				fileKey: documents.fileKey,
				docType: documents.docType,
				purpose: documents.purpose,
				ocrStatus: documents.ocrStatus,
				ocrResult: documents.ocrResult,
				notes: documents.notes,
				createdAt: documents.createdAt
			})
			.from(documents)
			.where(
				and(
					eq(documents.projectId, projectId),
					eq(documents.purpose, 'reference'),
					isNull(documents.deletedAt),
					or(isNull(documents.entityId), not(inArray(documents.entityType, ['contract', 'quotation', 'purchase_order'])))
				)
			)
			.orderBy(desc(documents.createdAt));

		const contractRows = await ctx.db
			.select({
				id: contracts.id,
				contractNumber: contracts.contractNumber,
				fileUrl: contracts.fileUrl,
				amount: contracts.amount,
				currency: contracts.currency,
				date: contracts.effectiveDate,
				status: contracts.status,
				metadata: contracts.metadata,
				createdAt: contracts.createdAt
			})
			.from(contracts)
			.where(and(eq(contracts.projectId, projectId), isNull(contracts.deletedAt)))
			.orderBy(desc(contracts.createdAt));

		const quotationRows = await ctx.db
			.select({
				id: quotations.id,
				quotationNumber: quotations.quotationNumber,
				fileUrl: quotations.fileUrl,
				amount: quotations.amount,
				currency: quotations.currency,
				date: quotations.date,
				status: quotations.status,
				metadata: quotations.metadata,
				createdAt: quotations.createdAt
			})
			.from(quotations)
			.where(and(eq(quotations.projectId, projectId), isNull(quotations.deletedAt)))
			.orderBy(desc(quotations.createdAt));

		const purchaseOrderRows = await ctx.db
			.select({
				id: purchaseOrders.id,
				poNumber: purchaseOrders.poNumber,
				fileUrl: purchaseOrders.fileUrl,
				supplierName: purchaseOrders.supplierName,
				amount: purchaseOrders.amount,
				currency: purchaseOrders.currency,
				date: purchaseOrders.date,
				status: purchaseOrders.status,
				metadata: purchaseOrders.metadata,
				createdAt: purchaseOrders.createdAt
			})
			.from(purchaseOrders)
			.where(and(eq(purchaseOrders.projectId, projectId), isNull(purchaseOrders.deletedAt)))
			.orderBy(desc(purchaseOrders.createdAt));

		const expenseRows = await ctx.db
			.select({
				id: expenses.id,
				category: expenses.category,
				expenseType: expenses.expenseType,
				docType: expenses.docType,
				date: expenses.date,
				amount: expenses.amount,
				currency: expenses.currency,
				documentRef: expenses.documentRef,
				metadata: expenses.metadata,
				createdAt: expenses.createdAt
			})
			.from(expenses)
			.where(and(eq(expenses.projectId, projectId), isNull(expenses.deletedAt)))
			.orderBy(desc(expenses.date), desc(expenses.createdAt));

		const revenueRows = await ctx.db
			.select({
				id: revenue.id,
				invoiceType: revenue.invoiceType,
				invoiceNumber: revenue.invoiceNumber,
				clientName: revenue.clientName,
				date: revenue.date,
				amount: revenue.amount,
				currency: revenue.currency,
				documentRef: revenue.documentRef,
				notes: revenue.notes,
				createdAt: revenue.createdAt
			})
			.from(revenue)
			.where(and(eq(revenue.projectId, projectId), isNull(revenue.deletedAt)))
			.orderBy(desc(revenue.date), desc(revenue.createdAt));

		const normalizedContracts = contractRows.map((contract) => ({
			...contract,
			displayNumber: friendlyDocNumber(contract.contractNumber, contract.id),
			displayFileName: referenceFileLabel(contract.fileUrl, contract.metadata)
		}));

		const normalizedQuotations = quotationRows.map((quotation) => ({
			...quotation,
			displayNumber: friendlyDocNumber(quotation.quotationNumber, quotation.id),
			displayFileName: referenceFileLabel(quotation.fileUrl, quotation.metadata)
		}));

		const normalizedPurchaseOrders = purchaseOrderRows.map((purchaseOrder) => ({
			...purchaseOrder,
			displayNumber: friendlyDocNumber(purchaseOrder.poNumber, purchaseOrder.id),
			displayFileName: referenceFileLabel(purchaseOrder.fileUrl, purchaseOrder.metadata)
		}));

		const expenseDocuments = expenseRows.map((expense) => {
			const metadata = parseDocumentMetadata(expense.metadata ?? null);
			const uploadName = metadata.upload?.fileName?.trim();
			const refName = referenceNameFromDocumentRef(expense.documentRef);
			return {
				...expense,
				displayNumber: friendlyDocNumber(null, expense.id),
				displayFileName: uploadName || refName || expense.category || 'Expense',
				statusLabel: expense.expenseType === 'sales_cost' ? 'Sales Cost' : 'OpEx'
			};
		});

		const revenueDocuments = revenueRows.map((record) => {
			const refName = referenceNameFromDocumentRef(record.documentRef);
			return {
				...record,
				displayNumber: friendlyDocNumber(record.invoiceNumber, record.id),
				displayFileName: refName || record.clientName || 'Revenue Invoice',
				statusLabel:
					record.invoiceType === 'zero_rate'
						? 'Zero Rate'
						: record.invoiceType === 'tax_invoice'
							? 'Tax Invoice'
							: 'Standard'
			};
		});

		return {
			documents: referenceDocs,
			contracts: normalizedContracts,
			quotations: normalizedQuotations,
			purchaseOrders: normalizedPurchaseOrders,
			expenseDocuments,
			revenueDocuments
		};
	};

	const getProjectFinancialDetail = async (projectId: string) => {
		const [revenueRows] = await ctx.db
			.select({ total: projectRevenueTotalSumExpr() })
			.from(revenue)
			.where(and(eq(revenue.projectId, projectId), isNull(revenue.deletedAt)));
		const [purchaseCost] = await ctx.db
			.select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)` })
			.from(expenses)
			.where(
				and(
					eq(expenses.projectId, projectId),
					eq(expenses.expenseType, 'sales_cost'),
					isNull(expenses.deletedAt)
				)
			);
		const staffPayoutWhere = and(eq(payoutRecords.projectId, projectId), staffCostPayoutJoinConditions());
		const [staffCost] = await ctx.db
			.select({ total: staffCostSumExpr() })
			.from(payoutRecords)
			.innerJoin(compensationComponents, eq(payoutRecords.componentId, compensationComponents.id))
			.where(staffPayoutWhere);
		const expenseWhere = and(eq(expenses.projectId, projectId), isNull(expenses.deletedAt));
		const [expenseOpexRow, expenseSalesCostRow] = await Promise.all([
			ctx.db.select({ total: projectExpenseOpexSumExpr() }).from(expenses).where(expenseWhere),
			ctx.db.select({ total: projectExpenseSalesCostSumExpr() }).from(expenses).where(expenseWhere)
		]);
		const expenseOpexCost = expenseOpexRow[0]?.total ?? 0;
		const expenseSalesCost = expenseSalesCostRow[0]?.total ?? 0;
		const expenseCost = expenseOpexCost + expenseSalesCost;

		const [revenueItemsRaw, purchaseItems, staffItems, expenseRows] = await Promise.all([
			ctx.db
				.select({
					id: revenue.id,
					label: sql<string>`coalesce(${revenue.invoiceNumber}, ${revenue.id})`,
					date: revenue.date,
					status: sql<string>`'completed'`,
					amount: revenueSgdAmountExpr()
				})
				.from(revenue)
				.where(and(eq(revenue.projectId, projectId), isNull(revenue.deletedAt)))
				.orderBy(sql`${revenue.date} desc`, sql`${revenue.createdAt} desc`),
			ctx.db
				.select({
					id: expenses.id,
					label: sql<string>`coalesce(${expenses.vendorOrSupplier}, ${expenses.id})`,
					date: expenses.date,
					status: sql<string>`'sales_cost'`,
					amount: expenses.amount
				})
				.from(expenses)
				.where(
					and(
						eq(expenses.projectId, projectId),
						eq(expenses.expenseType, 'sales_cost'),
						isNull(expenses.deletedAt)
					)
				)
				.orderBy(sql`${expenses.date} desc`, sql`${expenses.createdAt} desc`),
			ctx.db
				.select({
					id: payoutRecords.id,
					label: compensationComponents.label,
					date: payoutRecords.period,
					status: payoutRecords.status,
					amount: payoutRecords.computedAmount
				})
				.from(payoutRecords)
				.innerJoin(compensationComponents, eq(payoutRecords.componentId, compensationComponents.id))
				.where(staffPayoutWhere)
				.orderBy(sql`${payoutRecords.period} desc`, sql`${payoutRecords.createdAt} desc`),
			ctx.db
				.select({
					id: expenses.id,
					category: expenses.category,
					date: expenses.date,
					amount: expenses.amount,
					sgdEquivalent: expenses.sgdEquivalent,
					currency: expenses.currency,
					expenseType: expenses.expenseType
				})
				.from(expenses)
				.where(and(eq(expenses.projectId, projectId), isNull(expenses.deletedAt)))
				.orderBy(sql`${expenses.date} desc`, sql`${expenses.createdAt} desc`)
		]);

		const normalizedRevenueItems = revenueItemsRaw.map((row) => ({
			...row,
			amount: Number(row.amount ?? 0)
		}));

		const expenseItems = expenseRows.map((row) => ({
			id: row.id,
			label: row.category,
			date: row.date,
			status: row.expenseType === 'sales_cost' ? 'Sales Cost' : 'OpEx',
			amount: effectiveAmountSgd(row.currency, row.sgdEquivalent, row.amount)
		}));

		const breakdown = {
			revenue: revenueRows?.total ?? 0,
			purchaseCost: purchaseCost?.total ?? 0,
			staffCost: staffCost?.total ?? 0,
			expenseCost,
			expenseSalesCost,
			expenseOpexCost
		};

		const grossProfit =
			breakdown.revenue - breakdown.purchaseCost - breakdown.staffCost - breakdown.expenseSalesCost;
		const profit = grossProfit - breakdown.expenseOpexCost;

		return {
			breakdown,
			details: {
				revenueItems: normalizedRevenueItems,
				purchaseItems,
				staffItems,
				expenseItems
			},
			grossProfit,
			profit,
			metricDocCounts: {
				revenue: normalizedRevenueItems.length,
				purchase: purchaseItems.length,
				staff: staffItems.length,
				expense: expenseItems.length
			}
		};
	};

	const getCategoryBreakdown = async (input: DashboardOverviewRangeInput = {}) => {
		const from = input.from ?? '';
		const to = input.to ?? '';

		const end = input.now ? new Date(input.now) : new Date();
		const start = new Date(end);
		start.setUTCDate(start.getUTCDate() - 29);

		const hasCustomRange = isIsoDate(from) && isIsoDate(to) && from <= to;
		const current = hasCustomRange
			? { start: from, end: to }
			: {
					start: start.toISOString().slice(0, 10),
					end: end.toISOString().slice(0, 10)
				};

		const expenseByCategory = await ctx.db
			.select({
				category: expenses.category,
				expenseType: expenses.expenseType,
				total: sql<number>`coalesce(sum(${expenseSgdAmountExpr()}), 0)`,
				count: sql<number>`count(*)`
			})
			.from(expenses)
			.where(
				and(
					between(expenses.date, current.start, current.end),
					isNull(expenses.deletedAt)
				)
			)
			.groupBy(expenses.category, expenses.expenseType)
			.orderBy(sql`total desc`);

		const revenueByType = await ctx.db
			.select({
				invoiceType: revenue.invoiceType,
				total: sql<number>`coalesce(sum(${revenueSgdAmountExpr()}), 0)`,
				count: sql<number>`count(*)`
			})
			.from(revenue)
			.where(
				and(
					between(revenue.date, current.start, current.end),
					isNull(revenue.deletedAt)
				)
			)
			.groupBy(revenue.invoiceType);

		const opexCategories = expenseByCategory
			.filter((r) => r.expenseType === 'opex')
			.map((r) => ({
				category: r.category,
				total: Number(r.total ?? 0),
				count: Number(r.count ?? 0)
			}));

		const cogsCategories = expenseByCategory
			.filter((r) => r.expenseType === 'sales_cost')
			.map((r) => ({
				category: r.category,
				total: Number(r.total ?? 0),
				count: Number(r.count ?? 0)
			}));

		const revenueBreakdown = revenueByType.map((r) => ({
			invoiceType: r.invoiceType,
			total: Number(r.total ?? 0),
			count: Number(r.count ?? 0)
		}));

		const totalOpex = opexCategories.reduce((s, r) => s + r.total, 0);
		const totalCogs = cogsCategories.reduce((s, r) => s + r.total, 0);
		const totalRevenue = revenueBreakdown.reduce((s, r) => s + r.total, 0);

		return {
			range: current,
			expenses: {
				opex: { categories: opexCategories, total: totalOpex },
				salesCost: { categories: cogsCategories, total: totalCogs },
				grandTotal: totalOpex + totalCogs
			},
			revenue: {
				byType: revenueBreakdown,
				total: totalRevenue
			},
			netProfit: totalRevenue - totalOpex - totalCogs
		};
	};

	const getProfitAndLossReport = async (input: DashboardOverviewRangeInput = {}) => {
		const from = input.from ?? '';
		const to = input.to ?? '';

		const end = input.now ? new Date(input.now) : new Date();
		const start = new Date(end);
		start.setUTCFullYear(start.getUTCFullYear(), 0, 1);

		const hasCustomRange = isIsoDate(from) && isIsoDate(to) && from <= to;
		const current = hasCustomRange
			? { start: from, end: to }
			: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };

		const [revenueStandard] = await ctx.db
			.select({ total: sql<number>`coalesce(sum(${revenueSgdAmountExpr()}), 0)` })
			.from(revenue)
			.where(
				and(
					between(revenue.date, current.start, current.end),
					isNull(revenue.deletedAt),
					eq(revenue.invoiceType, 'standard')
				)
			);
		const [revenueTaxInvoice] = await ctx.db
			.select({ total: sql<number>`coalesce(sum(${revenueSgdAmountExpr()}), 0)` })
			.from(revenue)
			.where(
				and(
					between(revenue.date, current.start, current.end),
					isNull(revenue.deletedAt),
					eq(revenue.invoiceType, 'tax_invoice')
				)
			);
		const [revenueZeroRate] = await ctx.db
			.select({ total: sql<number>`coalesce(sum(${revenueSgdAmountExpr()}), 0)` })
			.from(revenue)
			.where(
				and(
					between(revenue.date, current.start, current.end),
					isNull(revenue.deletedAt),
					eq(revenue.invoiceType, 'zero_rate')
				)
			);
		const [revenueExempt] = await ctx.db
			.select({ total: sql<number>`coalesce(sum(${revenueSgdAmountExpr()}), 0)` })
			.from(revenue)
			.where(
				and(
					between(revenue.date, current.start, current.end),
					isNull(revenue.deletedAt),
					eq(revenue.invoiceType, 'exempt')
				)
			);
		const [revenueOutOfScope] = await ctx.db
			.select({ total: sql<number>`coalesce(sum(${revenueSgdAmountExpr()}), 0)` })
			.from(revenue)
			.where(
				and(
					between(revenue.date, current.start, current.end),
					isNull(revenue.deletedAt),
					eq(revenue.invoiceType, 'out_of_scope')
				)
			);

		const salesCostByCategory = await ctx.db
			.select({
				category: expenses.category,
				total: sql<number>`coalesce(sum(${expenseSgdAmountExpr()}), 0)`
			})
			.from(expenses)
			.where(
				and(
					between(expenses.date, current.start, current.end),
					isNull(expenses.deletedAt),
					eq(expenses.expenseType, 'sales_cost')
				)
			)
			.groupBy(expenses.category)
			.orderBy(sql`total desc`);

		const [staffCost] = await ctx.db
			.select({ total: staffCostSumExpr() })
			.from(payoutRecords)
			.innerJoin(compensationComponents, eq(payoutRecords.componentId, compensationComponents.id))
			.where(and(staffCostPeriodBetween(current.start, current.end), staffCostPayoutJoinConditions()));

		const opexByCategory = await ctx.db
			.select({
				category: expenses.category,
				total: sql<number>`coalesce(sum(${expenseSgdAmountExpr()}), 0)`
			})
			.from(expenses)
			.where(
				and(
					between(expenses.date, current.start, current.end),
					isNull(expenses.deletedAt),
					eq(expenses.expenseType, 'opex')
				)
			)
			.groupBy(expenses.category)
			.orderBy(sql`total desc`);

		const stdRevenue = (revenueStandard?.total ?? 0) + (revenueTaxInvoice?.total ?? 0);
		const zrRevenue = revenueZeroRate?.total ?? 0;
		const exRevenue = revenueExempt?.total ?? 0;
		const opRevenue = revenueOutOfScope?.total ?? 0;
		const totalRevenue = stdRevenue + zrRevenue + exRevenue + opRevenue;

		const totalSalesCost = salesCostByCategory.reduce((s, r) => s + Number(r.total ?? 0), 0);
		const totalStaffCost = Number(staffCost?.total ?? 0);
		const grossProfit = totalRevenue - totalSalesCost - totalStaffCost;

		const totalOpex = opexByCategory.reduce((s, r) => s + Number(r.total ?? 0), 0);
		const netProfit = grossProfit - totalOpex;

		return {
			range: current,
			revenue: {
				standardRated: stdRevenue,
				zeroRated: zrRevenue,
				exempt: exRevenue,
				outOfScope: opRevenue,
				total: totalRevenue
			},
			costOfSales: {
				byCategory: salesCostByCategory.map((r) => ({
					category: r.category,
					total: Number(r.total ?? 0)
				})),
				staffCost: totalStaffCost,
				total: totalSalesCost + totalStaffCost
			},
			grossProfit,
			grossMargin: totalRevenue > 0 ? grossProfit / totalRevenue : 0,
			operatingExpenses: {
				byCategory: opexByCategory.map((r) => ({
					category: r.category,
					total: Number(r.total ?? 0)
				})),
				total: totalOpex
			},
			netProfit,
			netMargin: totalRevenue > 0 ? netProfit / totalRevenue : 0
		};
	};

	const getTrialBalance = async (input: DashboardOverviewRangeInput = {}) => {
		const from = input.from ?? '';
		const to = input.to ?? '';

		const end = input.now ? new Date(input.now) : new Date();
		const start = new Date(end);
		start.setUTCFullYear(start.getUTCFullYear(), 0, 1);

		const hasCustomRange = isIsoDate(from) && isIsoDate(to) && from <= to;
		const current = hasCustomRange
			? { start: from, end: to }
			: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };

		const revenueByType = await ctx.db
			.select({
				account: revenue.invoiceType,
				total: sql<number>`coalesce(sum(${revenueSgdAmountExpr()}), 0)`,
				count: sql<number>`count(*)`
			})
			.from(revenue)
			.where(
				and(
					between(revenue.date, current.start, current.end),
					isNull(revenue.deletedAt)
				)
			)
			.groupBy(revenue.invoiceType);

		const expenseByCategory = await ctx.db
			.select({
				account: expenses.category,
				expenseType: expenses.expenseType,
				total: sql<number>`coalesce(sum(${expenseSgdAmountExpr()}), 0)`,
				count: sql<number>`count(*)`
			})
			.from(expenses)
			.where(
				and(
					between(expenses.date, current.start, current.end),
					isNull(expenses.deletedAt)
				)
			)
			.groupBy(expenses.category, expenses.expenseType);

		const [staffCostRow] = await ctx.db
			.select({ total: staffCostSumExpr() })
			.from(payoutRecords)
			.innerJoin(compensationComponents, eq(payoutRecords.componentId, compensationComponents.id))
			.where(and(staffCostPeriodBetween(current.start, current.end), staffCostPayoutJoinConditions()));

		const invoiceTypeLabel: Record<string, string> = {
			standard: 'Revenue — Standard Rated',
			tax_invoice: 'Revenue — Tax Invoice',
			zero_rate: 'Revenue — Zero Rated',
			exempt: 'Revenue — Exempt',
			out_of_scope: 'Revenue — Out of Scope'
		};

		const accounts: Array<{
			account: string;
			type: 'revenue' | 'expense';
			subType: string;
			debit: number;
			credit: number;
			count: number;
		}> = [];

		for (const row of revenueByType) {
			const total = Number(row.total ?? 0);
			accounts.push({
				account: invoiceTypeLabel[row.account ?? ''] ?? `Revenue — ${row.account}`,
				type: 'revenue',
				subType: row.account ?? 'unknown',
				debit: 0,
				credit: total,
				count: Number(row.count ?? 0)
			});
		}

		for (const row of expenseByCategory) {
			const total = Number(row.total ?? 0);
			accounts.push({
				account: `${row.expenseType === 'sales_cost' ? 'COGS' : 'OpEx'} — ${row.account}`,
				type: 'expense',
				subType: row.expenseType ?? 'opex',
				debit: total,
				credit: 0,
				count: Number(row.count ?? 0)
			});
		}

		const staffTotal = Number(staffCostRow?.total ?? 0);
		if (staffTotal > 0) {
			accounts.push({
				account: 'Staff Cost — Payroll',
				type: 'expense',
				subType: 'staff_cost',
				debit: staffTotal,
				credit: 0,
				count: 0
			});
		}

		const totalDebit = accounts.reduce((s, a) => s + a.debit, 0);
		const totalCredit = accounts.reduce((s, a) => s + a.credit, 0);

		return {
			range: current,
			accounts: accounts.sort((a, b) => {
				if (a.type !== b.type) return a.type === 'revenue' ? -1 : 1;
				return b.debit + b.credit - (a.debit + a.credit);
			}),
			totalDebit,
			totalCredit,
			difference: totalDebit - totalCredit
		};
	};

	return {
		getCompanyFinancialOverview,
		getDashboardCharts,
		getProjectsProfitRanking,
		getProjectsProfitCsv,
		getProjectFinancialDetail,
		getProjectDocumentsSummary,
		getCategoryBreakdown,
		getProfitAndLossReport,
		getTrialBalance
	};
}

export type FinanceInsightsApi = ReturnType<typeof createFinanceInsightApi>;
