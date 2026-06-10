import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { ModuleContext } from '$platform/modules/types';
import { createEvent } from '$platform/modules';
import {
	CompensationComponentRepository,
	PayoutRepository,
	EmployeeCompensationRepository,
	AllocationRepository,
	staffCostPayoutJoinConditions,
	staffCostSumExpr
} from '../repositories/employee-repository';
import { createFinanceApi } from '$modules/finance';
import { persons } from '../repositories/person.schema';
import {
	compensationComponents,
	employeeCompensationComponents,
	employeeProjectAllocations,
	payoutRecords
} from '../repositories/employee.schema';
import { projectEmployees } from '$modules/project/repositories/project.schema';

// ---------------------------------------------------------------------------
// Helpers (absorbed from company-allocation-settle.ts)
// ---------------------------------------------------------------------------

export function allocationPeriodDay(monthYm: string): string {
	return `${monthYm}-01`;
}

export function periodCalendarMonth(period: string): string {
	if (period.length >= 7) return period.slice(0, 7);
	return period;
}

export function shadowCompensationComponentId(peId: string, eccId: string): string {
	return `alloc-${peId}-${eccId}`;
}

function monthStart(ym: string): string {
	return `${ym}-01`;
}

function sameCalendarMonth(isoDate: string | null | undefined, ym: string): boolean {
	if (!isoDate) return false;
	return periodCalendarMonth(isoDate) === ym;
}

function initialsFromName(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type RowStatus = 'paid' | 'confirmed' | 'draft' | 'pending' | 'off';

function settlementPayoutForComponent(
	payouts: Array<{ componentId: string; period: string; status: string; source: string }>,
	componentId: string,
	monthYm: string
): (typeof payouts)[number] | undefined {
	const period = monthStart(monthYm);
	return payouts.find(
		(p) =>
			p.componentId === componentId &&
			p.source === 'settlement' &&
			(p.period === period || periodCalendarMonth(p.period) === monthYm)
	);
}

function componentEligibleForMonth(
	component: { frequency: string; effectiveFrom: string; effectiveTo: string | null },
	monthYm: string
): boolean {
	const period = monthStart(monthYm);
	if (component.frequency === 'monthly') {
		if (component.effectiveFrom > period) return false;
		if (component.effectiveTo && component.effectiveTo < period) return false;
		return true;
	}
	if (component.frequency === 'one_off') {
		return sameCalendarMonth(component.effectiveFrom, monthYm);
	}
	return false;
}

// ---------------------------------------------------------------------------
// CompensationService
// ---------------------------------------------------------------------------

export class CompensationService {
	private compRepo: CompensationComponentRepository;
	private empCompRepo: EmployeeCompensationRepository;

	constructor(private ctx: ModuleContext) {
		this.compRepo = new CompensationComponentRepository(ctx.db);
		this.empCompRepo = new EmployeeCompensationRepository(ctx.db);
	}

	async getProjectComponents(projectEmployeeId: string) {
		return this.compRepo.findByProjectEmployee(projectEmployeeId);
	}

	async getEmployeeComponents(employeeId: string) {
		return this.empCompRepo.findByEmployee(employeeId);
	}

	async addProjectComponent(data: Record<string, unknown>) {
		return this.compRepo.create(data);
	}

	async removeProjectComponent(id: string) {
		return this.compRepo.softDelete(id);
	}

	async addEmployeeComponent(data: Record<string, unknown>) {
		return this.empCompRepo.create(data);
	}

	async removeEmployeeComponent(id: string) {
		return this.empCompRepo.softDelete(id);
	}
}

// ---------------------------------------------------------------------------
// SettlementService (absorbed from settle-project-components.ts + company-allocation-settle.ts)
// ---------------------------------------------------------------------------

export class SettlementService {
	constructor(private ctx: ModuleContext) {}

	/**
	 * Settle manual project compensation components for a given month.
	 * Absorbed from settle-project-components.ts
	 */
	async settleProjectComponents(params: {
		projectId: string;
		peId: string;
		monthYm: string;
	}): Promise<number> {
		const { db } = this.ctx;
		const { projectId, peId, monthYm } = params;
		if (!/^\d{4}-\d{2}$/.test(monthYm)) return 0;

		const components = await db
			.select()
			.from(compensationComponents)
			.where(
				and(
					eq(compensationComponents.projectEmployeeId, peId),
					or(eq(compensationComponents.origin, 'manual'), isNull(compensationComponents.origin)),
					isNull(compensationComponents.deletedAt)
				)
			);

		const period = monthStart(monthYm);
		const now = new Date().toISOString();
		let lines = 0;
		const [member] = await db
			.select({ personId: projectEmployees.personId })
			.from(projectEmployees)
			.where(eq(projectEmployees.id, peId))
			.limit(1);
		const personId = member?.personId ?? peId;

		for (const c of components) {
			if (c.frequency !== 'monthly' && c.frequency !== 'one_off') continue;
			if (c.frequency === 'monthly') {
				if (c.effectiveFrom > period) continue;
				if (c.effectiveTo && c.effectiveTo < period) continue;
			} else if (c.frequency === 'one_off') {
				if (!sameCalendarMonth(c.effectiveFrom, monthYm)) continue;
			}
			const amount = c.value ?? 0;
			const taxableAmount = c.taxable ? amount : 0;
			const note = `Project component settlement (${monthYm})`;

			const [existing] = await db
				.select({ id: payoutRecords.id })
				.from(payoutRecords)
				.where(
					and(
						eq(payoutRecords.componentId, c.id),
						eq(payoutRecords.projectId, projectId),
						eq(payoutRecords.period, period),
						eq(payoutRecords.source, 'settlement'),
						isNull(payoutRecords.deletedAt)
					)
				)
				.limit(1);

			let payoutId: string;
			if (existing) {
				await db
					.update(payoutRecords)
					.set({
						baseValue: amount,
						computedAmount: amount,
						taxableAmount,
						status: 'confirmed',
						note,
						updatedAt: now
					})
					.where(eq(payoutRecords.id, existing.id));
				payoutId = existing.id;
			} else {
				const createdId = crypto.randomUUID();
				await db.insert(payoutRecords).values({
					id: createdId,
					componentId: c.id,
					projectId,
					period,
					baseValue: amount,
					computedAmount: amount,
					cpfEmployee: 0,
					cpfEmployer: 0,
					taxableAmount,
					status: 'confirmed',
					source: 'settlement',
					note,
					createdAt: now,
					updatedAt: now
				});
				payoutId = createdId;
			}

			await this.ctx.eventBus.emit(
				createEvent('payout.settled', 'employee', {
					payoutId,
					projectId,
					personId,
					amount,
					period
				})
			);
			lines += 1;
		}

		return lines;
	}

	/**
	 * Settle company-level salary allocation to a project for a given month.
	 * Absorbed from company-allocation-settle.ts
	 */
	async settleCompanyAllocation(params: {
		projectId: string;
		peId: string;
		employeeId: string;
		monthYm: string;
	}): Promise<{ ok: true; lines: number } | { ok: false; message: string }> {
		const { db } = this.ctx;
		const { projectId, peId, employeeId, monthYm } = params;
		if (!/^\d{4}-\d{2}$/.test(monthYm)) {
			return { ok: false, message: 'Invalid month.' };
		}

		const period = allocationPeriodDay(monthYm);
		const now = new Date().toISOString();

		const [allocationRow] = await db
			.select()
			.from(employeeProjectAllocations)
			.where(
				and(
					eq(employeeProjectAllocations.employeeId, employeeId),
					eq(employeeProjectAllocations.projectId, projectId),
					isNull(employeeProjectAllocations.deletedAt)
				)
			)
			.limit(1);

		const weightPct = allocationRow?.weightPct ?? 0;
		if (weightPct <= 0) {
			return { ok: false, message: 'No positive allocation weight for this project on the employee master.' };
		}

		const companyComponents = await db
			.select()
			.from(employeeCompensationComponents)
			.where(
				and(
					eq(employeeCompensationComponents.employeeId, employeeId),
					isNull(employeeCompensationComponents.deletedAt)
				)
			);

		let lines = 0;

		for (const ecc of companyComponents) {
			if (ecc.incomeType === 'dividend') continue;
			if (ecc.ruleType !== 'fixed' || ecc.frequency !== 'monthly') continue;
			if (ecc.effectiveFrom > period) continue;
			if (ecc.effectiveTo != null && ecc.effectiveTo < period) continue;

			const amount = (ecc.value * weightPct) / 100;
			if (amount <= 0) continue;

			const shadowId = shadowCompensationComponentId(peId, ecc.id);
			const label = `[Company] ${ecc.label}`;
			const existingShadow = await db
				.select({ id: compensationComponents.id })
				.from(compensationComponents)
				.where(eq(compensationComponents.id, shadowId))
				.limit(1);

			if (existingShadow.length > 0) {
				await db
					.update(compensationComponents)
					.set({
						label,
						incomeType: ecc.incomeType,
						ruleType: 'fixed',
						value: amount,
						frequency: 'monthly',
						taxable: ecc.taxable,
						effectiveFrom: period,
						deletedAt: null,
						updatedAt: now,
						origin: 'company_allocated',
						employeeCompensationComponentId: ecc.id
					})
					.where(eq(compensationComponents.id, shadowId));
			} else {
				await db.insert(compensationComponents).values({
					id: shadowId,
					projectEmployeeId: peId,
					origin: 'company_allocated',
					employeeCompensationComponentId: ecc.id,
					label,
					incomeType: ecc.incomeType,
					ruleType: 'fixed',
					value: amount,
					floor: null,
					cap: null,
					frequency: 'monthly',
					taxable: ecc.taxable,
					effectiveFrom: period,
					effectiveTo: null,
					createdAt: now,
					updatedAt: now
				});
			}

			const taxableAmount = ecc.taxable ? amount : 0;
			const [existingPayout] = await db
				.select({ id: payoutRecords.id })
				.from(payoutRecords)
				.where(
					and(
						eq(payoutRecords.componentId, shadowId),
						eq(payoutRecords.projectId, projectId),
						eq(payoutRecords.period, period),
						eq(payoutRecords.source, 'allocated_from_company'),
						isNull(payoutRecords.deletedAt)
					)
				)
				.limit(1);

			const note = `${ecc.label} × ${weightPct}% (company �?project)`;

			let payoutId: string;
			if (existingPayout) {
				await db
					.update(payoutRecords)
					.set({
						baseValue: ecc.value,
						computedAmount: amount,
						taxableAmount,
						status: 'confirmed',
						note,
						updatedAt: now
					})
					.where(eq(payoutRecords.id, existingPayout.id));
				payoutId = existingPayout.id;
			} else {
				const createdId = crypto.randomUUID();
				await db.insert(payoutRecords).values({
					id: createdId,
					componentId: shadowId,
					projectId,
					period,
					baseValue: ecc.value,
					computedAmount: amount,
					cpfEmployee: 0,
					cpfEmployer: 0,
					taxableAmount,
					status: 'confirmed',
					source: 'allocated_from_company',
					note,
					createdAt: now,
					updatedAt: now
				});
				payoutId = createdId;
			}

			await this.ctx.eventBus.emit(
				createEvent('payout.settled', 'employee', {
					payoutId,
					projectId,
					personId: employeeId,
					amount,
					period
				})
			);
			lines += 1;
		}

		if (lines === 0) {
			return {
				ok: false,
				message: 'Nothing to settle: add monthly fixed company components (non-dividend), or check effective dates and allocation % on the employee master.'
			};
		}

		return { ok: true, lines };
	}
}

// ---------------------------------------------------------------------------
// ProjectStaffingService
// ---------------------------------------------------------------------------

export class ProjectStaffingService {
	private settlement: SettlementService;

	constructor(private ctx: ModuleContext) {
		this.settlement = new SettlementService(ctx);
	}

	private monthWindow(monthQ: string | null) {
		const selectedMonthYm =
			monthQ && /^\d{4}-\d{2}$/.test(monthQ) ? monthQ : new Date().toISOString().slice(0, 7);
		const y = Number(selectedMonthYm.slice(0, 4));
		const calMonth = Number(selectedMonthYm.slice(5, 7));
		const prevD = new Date(y, calMonth - 2, 1);
		const nextD = new Date(y, calMonth, 1);
		const prevMonthYm = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;
		const nextMonthYm = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}`;
		return { selectedMonthYm, prevMonthYm, nextMonthYm };
	}

	async getProjectStaffingPage(projectId: string, monthQ: string | null) {
		const db = this.ctx.db;
		const { selectedMonthYm, prevMonthYm, nextMonthYm } = this.monthWindow(monthQ);

		const rosterRows = await db
			.select({
				pe: projectEmployees,
				masterName: persons.name
			})
			.from(projectEmployees)
			.leftJoin(persons, eq(projectEmployees.personId, persons.id))
			.where(and(eq(projectEmployees.projectId, projectId), isNull(projectEmployees.deletedAt)))
			.orderBy(asc(projectEmployees.name));

		const roster = rosterRows.map((row) => ({
			...row.pe,
			masterName: row.masterName
		}));

		const assignedIds = roster.map((row) => row.personId).filter((id): id is string => Boolean(id));
		const peIds = roster.map((row) => row.id);

		const allocationRows =
			assignedIds.length > 0
				? await db
						.select()
						.from(employeeProjectAllocations)
						.where(
							and(
								eq(employeeProjectAllocations.projectId, projectId),
								inArray(employeeProjectAllocations.employeeId, assignedIds),
								isNull(employeeProjectAllocations.deletedAt)
							)
						)
				: [];

		const allocByEmployee = new Map(allocationRows.map((allocation) => [allocation.employeeId, allocation.weightPct ?? 0]));

		// Wave 2.2: legacy employees.type/status/active filter dropped — return all
		// non-deleted persons. type/status now live in employee_profiles via personId
		// join when needed; basic assignment screens just need id/name.
		const allEmployees = await db
			.select({
				id: persons.id,
				name: persons.name,
				type: sql<string>`'employee'`,
				status: sql<string>`'active'`
			})
			.from(persons)
			.where(isNull(persons.deletedAt))
			.orderBy(asc(persons.name));

		const assignableEmployees = allEmployees.filter((employee) => !assignedIds.includes(employee.id));

		const [staffAllRow] = await db
			.select({ total: staffCostSumExpr() })
			.from(payoutRecords)
			.innerJoin(compensationComponents, eq(payoutRecords.componentId, compensationComponents.id))
			.where(and(eq(payoutRecords.projectId, projectId), staffCostPayoutJoinConditions()));

		// Wave 2.1b: invoicesIn no longer queried — sales-cost expenses (i.e. supplier
		// invoice intake) live in expenses with expenseType='sales_cost'.
		const expenseSums = await createFinanceApi(this.ctx).expenses.getProjectExpenseSums(projectId);
		const salesCostTotal = expenseSums.salesCost ?? 0;
		const opexTotal = expenseSums.opex ?? 0;
		const expenseTotal = salesCostTotal + opexTotal;

		const staffCostAllTime = staffAllRow?.total ?? 0;
		const totalProjectCost = staffCostAllTime + expenseTotal;
		const staffPctOfTotalCost =
			totalProjectCost > 0 ? Math.round((staffCostAllTime / totalProjectCost) * 1000) / 10 : 0;

		const payoutList =
			peIds.length > 0
				? await db
						.select({
							id: payoutRecords.id,
							period: payoutRecords.period,
							computedAmount: payoutRecords.computedAmount,
							taxableAmount: payoutRecords.taxableAmount,
							status: payoutRecords.status,
							source: payoutRecords.source,
							componentId: compensationComponents.id,
							componentLabel: compensationComponents.label,
							incomeType: compensationComponents.incomeType,
							projectEmployeeId: compensationComponents.projectEmployeeId
						})
						.from(payoutRecords)
						.innerJoin(compensationComponents, eq(payoutRecords.componentId, compensationComponents.id))
						.where(
							and(
								eq(payoutRecords.projectId, projectId),
								inArray(compensationComponents.projectEmployeeId, peIds),
								isNull(payoutRecords.deletedAt),
								isNull(compensationComponents.deletedAt)
							)
						)
				: [];

		const manualComponents =
			peIds.length > 0
				? await db
						.select()
						.from(compensationComponents)
						.where(
							and(
								inArray(compensationComponents.projectEmployeeId, peIds),
								or(isNull(compensationComponents.origin), eq(compensationComponents.origin, 'manual')),
								isNull(compensationComponents.deletedAt)
							)
						)
				: [];

		const payoutsByPe = new Map<string, typeof payoutList>();
		for (const payout of payoutList) {
			const list = payoutsByPe.get(payout.projectEmployeeId) ?? [];
			list.push(payout);
			payoutsByPe.set(payout.projectEmployeeId, list);
		}

		const componentsByPe = new Map<string, typeof manualComponents>();
		for (const component of manualComponents) {
			const list = componentsByPe.get(component.projectEmployeeId) ?? [];
			list.push(component);
			componentsByPe.set(component.projectEmployeeId, list);
		}

		const isStaffCostEligible = (payout: (typeof payoutList)[number]) =>
			payout.incomeType !== 'dividend' && (payout.status === 'confirmed' || payout.status === 'paid');
		const isDraft = (payout: (typeof payoutList)[number]) => payout.status === 'draft';

		const settledThisMonth = payoutList
			.filter((payout) => periodCalendarMonth(payout.period) === selectedMonthYm && isStaffCostEligible(payout))
			.reduce((sum, payout) => sum + payout.computedAmount, 0);

		const draftPayoutsThisMonth = payoutList.filter(
			(payout) => periodCalendarMonth(payout.period) === selectedMonthYm && isDraft(payout)
		);
		const pendingSettlementAmount = draftPayoutsThisMonth.reduce((sum, payout) => sum + payout.computedAmount, 0);
		let pendingComponentsCount = 0;

		const teamMembers = roster.map((pe, index) => {
			const pePayouts = payoutsByPe.get(pe.id) ?? [];
			const comps = componentsByPe.get(pe.id) ?? [];

			const settledPayouts = pePayouts.filter(isStaffCostEligible);
			const totalSettled = settledPayouts.reduce((sum, payout) => sum + payout.computedAmount, 0);
			const withDraft = pePayouts.filter(
				(payout) =>
					payout.incomeType !== 'dividend' &&
					(payout.status === 'confirmed' || payout.status === 'paid' || payout.status === 'draft')
			);
			const totalWithDraft = withDraft.reduce((sum, payout) => sum + payout.computedAmount, 0);

			const draftMonthAmount = pePayouts
				.filter((payout) => periodCalendarMonth(payout.period) === selectedMonthYm && isDraft(payout))
				.reduce((sum, payout) => sum + payout.computedAmount, 0);

			let pePendingComp = 0;
			const componentRows = comps.map((component) => {
				const settlementPayout = settlementPayoutForComponent(pePayouts, component.id, selectedMonthYm);
				let rowStatus: RowStatus = 'off';
				if (settlementPayout) {
					if (settlementPayout.status === 'paid') rowStatus = 'paid';
					else if (settlementPayout.status === 'confirmed') rowStatus = 'confirmed';
					else if (settlementPayout.status === 'draft') rowStatus = 'draft';
				} else if (componentEligibleForMonth(component, selectedMonthYm)) {
					rowStatus = 'pending';
					pePendingComp += 1;
				}
				return {
					id: component.id,
					label: component.label,
					amount: component.value ?? 0,
					taxable: component.taxable,
					frequency: component.frequency,
					incomeType: component.incomeType,
					rowStatus
				};
			});
			pendingComponentsCount += pePendingComp;

			const sortedPayouts = [...pePayouts].sort((a, b) =>
				a.period < b.period ? 1 : a.period > b.period ? -1 : 0
			);
			const recentPayouts = sortedPayouts.slice(0, 8).map((payout) => ({
				period: payout.period,
				label: payout.componentLabel,
				amount: payout.computedAmount,
				taxableAmount: payout.taxableAmount,
				status: payout.status,
				incomeType: payout.incomeType
			}));

			const reimbursementTotal = settledPayouts
				.filter((payout) => payout.incomeType === 'reimbursement')
				.reduce((sum, payout) => sum + payout.computedAmount, 0);
			const taxableTotal = settledPayouts.reduce((sum, payout) => sum + payout.taxableAmount, 0);

			const allocationPct = allocByEmployee.get(pe.personId ?? '') ?? 0;

			return {
				peId: pe.id,
				name: pe.name,
				staffType: pe.staffType,
				role: pe.role,
				employeeId: pe.personId,
				masterName: pe.masterName,
				allocationPct,
				initials: initialsFromName(pe.name),
				avatarHue: index % 4,
				totalSettled,
				totalWithDraft,
				draftMonthAmount,
				hasPendingSettlement: draftMonthAmount > 0 || pePendingComp > 0,
				components: componentRows,
				recentPayouts,
				summary: {
					computedTotal: totalSettled,
					taxableTotal,
					reimbursementTotal
				}
			};
		});

		const monthLabel = new Date(`${selectedMonthYm}-01`).toLocaleString('en-SG', {
			month: 'short',
			year: 'numeric'
		});

		return {
			roster,
			assignableEmployees,
			teamMembers,
			selectedMonthYm,
			prevMonthYm,
			nextMonthYm,
			monthLabel,
			summaryStats: {
				totalStaffCost: staffCostAllTime,
				memberCount: roster.length,
				settledThisMonth,
				pendingSettlementAmount,
				pendingSettlementLabel:
					draftPayoutsThisMonth.length > 0 || pendingComponentsCount > 0
						? `${draftPayoutsThisMonth.length} draft payout(s) �?${pendingComponentsCount} unsettled component(s)`
						: 'None',
				staffPctOfTotalCost
			}
		};
	}

	async getProjectStaffingDetailPage(projectId: string, projectEmployeeId: string, monthQ: string | null) {
		const db = this.ctx.db;
		const { selectedMonthYm, prevMonthYm, nextMonthYm } = this.monthWindow(monthQ);

		const [pe] = await db
			.select()
			.from(projectEmployees)
			.where(
				and(
					eq(projectEmployees.id, projectEmployeeId),
					eq(projectEmployees.projectId, projectId),
					isNull(projectEmployees.deletedAt)
				)
			)
			.limit(1);

		if (!pe) return null;

		const personIdForLookups = pe.personId ?? '';

		const [employee] = personIdForLookups
			? await db
					.select()
					.from(persons)
					.where(and(eq(persons.id, personIdForLookups), isNull(persons.deletedAt)))
					.limit(1)
			: [];

		const [allocationRow] = personIdForLookups
			? await db
					.select()
					.from(employeeProjectAllocations)
					.where(
						and(
							eq(employeeProjectAllocations.employeeId, personIdForLookups),
							eq(employeeProjectAllocations.projectId, projectId),
							isNull(employeeProjectAllocations.deletedAt)
						)
					)
					.limit(1)
			: [];

		const companyComponents = personIdForLookups
			? await db
					.select()
					.from(employeeCompensationComponents)
					.where(
						and(
							eq(employeeCompensationComponents.employeeId, personIdForLookups),
							isNull(employeeCompensationComponents.deletedAt)
						)
					)
					.orderBy(desc(employeeCompensationComponents.effectiveFrom))
			: [];

		const weightPct = allocationRow?.weightPct ?? 0;
		const companyAllocationPreview = companyComponents.map((component) => {
			let allocatedMonthly: number | null = null;
			if (weightPct > 0 && component.ruleType === 'fixed' && component.frequency === 'monthly') {
				allocatedMonthly = (component.value * weightPct) / 100;
			}
			return {
				id: component.id,
				label: component.label,
				incomeType: component.incomeType,
				ruleType: component.ruleType,
				value: component.value,
				frequency: component.frequency,
				weightPct,
				allocatedMonthly
			};
		});

		const companyAllocatedEstimate = companyAllocationPreview.reduce(
			(sum, row) => sum + (row.allocatedMonthly ?? 0),
			0
		);

		const projectComponents = await db
			.select()
			.from(compensationComponents)
			.where(
				and(
					eq(compensationComponents.projectEmployeeId, pe.id),
					isNull(compensationComponents.deletedAt),
					or(eq(compensationComponents.origin, 'manual'), isNull(compensationComponents.origin))
				)
			)
			.orderBy(desc(compensationComponents.effectiveFrom));

		const payouts = await db
			.select({
				id: payoutRecords.id,
				period: payoutRecords.period,
				computedAmount: payoutRecords.computedAmount,
				status: payoutRecords.status,
				source: payoutRecords.source,
				note: payoutRecords.note,
				componentLabel: compensationComponents.label,
				incomeType: compensationComponents.incomeType
			})
			.from(payoutRecords)
			.innerJoin(compensationComponents, eq(payoutRecords.componentId, compensationComponents.id))
			.where(
				and(
					eq(payoutRecords.projectId, projectId),
					eq(compensationComponents.projectEmployeeId, pe.id),
					isNull(payoutRecords.deletedAt),
					isNull(compensationComponents.deletedAt)
				)
			)
			.orderBy(desc(payoutRecords.period), desc(payoutRecords.createdAt));

		const payoutsThisMonth = payouts.filter((payout) => periodCalendarMonth(payout.period) === selectedMonthYm);
		const isConfirmed = (payout: (typeof payouts)[number]) =>
			payout.status === 'confirmed' || payout.status === 'paid';
		const confirmedEligible = payoutsThisMonth.filter(
			(payout) => isConfirmed(payout) && payout.incomeType !== 'dividend'
		);
		const confirmedStaffCostThisMonth = confirmedEligible.reduce(
			(sum, payout) => sum + payout.computedAmount,
			0
		);
		const allocatedSettledThisMonth = confirmedEligible
			.filter((payout) => payout.source === 'allocated_from_company')
			.reduce((sum, payout) => sum + payout.computedAmount, 0);
		const projectRulesSettledThisMonth = confirmedEligible
			.filter((payout) => payout.source === 'settlement')
			.reduce((sum, payout) => sum + payout.computedAmount, 0);
		const adjustmentSettledThisMonth = confirmedEligible
			.filter((payout) => payout.source === 'adjustment')
			.reduce((sum, payout) => sum + payout.computedAmount, 0);

		return {
			pe,
			employee,
			allocationRow: allocationRow ?? null,
			companyAllocationPreview,
			companyAllocatedEstimate,
			projectComponents,
			payouts,
			selectedMonthYm,
			prevMonthYm,
			nextMonthYm,
			confirmedStaffCostThisMonth,
			allocatedSettledThisMonth,
			projectRulesSettledThisMonth,
			adjustmentSettledThisMonth
		};
	}

	async settleAllForMonth(projectId: string, monthYm: string) {
		const rosterRows = await this.ctx.db
			.select({ pe: projectEmployees })
			.from(projectEmployees)
			.where(and(eq(projectEmployees.projectId, projectId), isNull(projectEmployees.deletedAt)));

		let allocLines = 0;
		let allocSkipped = 0;
		let compLines = 0;

		for (const { pe } of rosterRows) {
			if (!pe.personId) continue;
			const allocationResult = await this.settlement.settleCompanyAllocation({
				projectId,
				peId: pe.id,
				employeeId: pe.personId,
				monthYm
			});
			if (allocationResult.ok) allocLines += allocationResult.lines;
			else allocSkipped += 1;

			compLines += await this.settlement.settleProjectComponents({
				projectId,
				peId: pe.id,
				monthYm
			});
		}

		return {
			ok: true,
			message: `${monthYm}: posted ${allocLines} company-allocation payout line(s) (${allocSkipped} roster member(s) skipped鈥攏o allocation or nothing to settle), ${compLines} project component line(s).`
		};
	}

	async addToProject(
		projectId: string,
		input: {
			employeeId: string;
			role: string | null;
			staffType: string;
			dateIn: string | null;
			dateOut: string | null;
		}
	) {
		const db = this.ctx.db;
		const [existing] = await db
			.select({ id: projectEmployees.id })
			.from(projectEmployees)
			.where(
				and(
					eq(projectEmployees.projectId, projectId),
					eq(projectEmployees.personId, input.employeeId),
					isNull(projectEmployees.deletedAt)
				)
			)
			.limit(1);

		if (existing) return { ok: false as const, message: 'That employee is already on this project.' };

		const [employee] = await db
			.select()
			.from(persons)
			.where(and(eq(persons.id, input.employeeId), isNull(persons.deletedAt)))
			.limit(1);

		if (!employee) return { ok: false as const, message: 'Employee not found.' };

		const peId = `pe-${projectId}-${input.employeeId}`;
		const now = new Date().toISOString();

		const [prior] = await db
			.select()
			.from(projectEmployees)
			.where(and(eq(projectEmployees.projectId, projectId), eq(projectEmployees.personId, input.employeeId)))
			.limit(1);

		if (prior?.deletedAt) {
			await db
				.update(projectEmployees)
				.set({
					name: employee.name,
					role: input.role,
					staffType: input.staffType as (typeof projectEmployees.$inferInsert)['staffType'],
					dateIn: input.dateIn,
					dateOut: input.dateOut,
					cpfApplicable: true,
					deletedAt: null,
					updatedAt: now
				})
				.where(eq(projectEmployees.id, prior.id));
		} else {
			await db.insert(projectEmployees).values({
				id: peId,
				projectId,
				personId: input.employeeId,
				name: employee.name,
				role: input.role,
				staffType: input.staffType as (typeof projectEmployees.$inferInsert)['staffType'],
				dateIn: input.dateIn,
				dateOut: input.dateOut,
				cpfApplicable: true,
				createdAt: now,
				updatedAt: now
			});
		}

		return { ok: true as const };
	}

	async removeFromProject(projectId: string, projectEmployeeId: string) {
		const db = this.ctx.db;
		const now = new Date().toISOString();

		const [pe] = await db
			.select({ id: projectEmployees.id })
			.from(projectEmployees)
			.where(
				and(
					eq(projectEmployees.id, projectEmployeeId),
					eq(projectEmployees.projectId, projectId),
					isNull(projectEmployees.deletedAt)
				)
			)
			.limit(1);

		if (!pe) return { ok: false as const, message: 'Assignment not found.' };

		const components = await db
			.select({ id: compensationComponents.id })
			.from(compensationComponents)
			.where(
				and(
					eq(compensationComponents.projectEmployeeId, projectEmployeeId),
					isNull(compensationComponents.deletedAt)
				)
			);

		for (const component of components) {
			await db
				.update(compensationComponents)
				.set({ deletedAt: now, updatedAt: now })
				.where(eq(compensationComponents.id, component.id));
		}

		await db
			.update(projectEmployees)
			.set({ deletedAt: now, updatedAt: now })
			.where(eq(projectEmployees.id, projectEmployeeId));

		return { ok: true as const };
	}

	async updateAssignment(
		projectId: string,
		projectEmployeeId: string,
		input: {
			role: string | null;
			staffType: string;
			dateIn: string | null;
			dateOut: string | null;
			cpfApplicable: boolean;
		}
	) {
		const db = this.ctx.db;
		const now = new Date().toISOString();
		const [pe] = await db
			.select()
			.from(projectEmployees)
			.where(
				and(
					eq(projectEmployees.id, projectEmployeeId),
					eq(projectEmployees.projectId, projectId),
					isNull(projectEmployees.deletedAt)
				)
			)
			.limit(1);

		if (!pe) return { ok: false as const, message: 'Assignment not found.' };

		const [employee] = pe.personId
			? await db
					.select({ name: persons.name })
					.from(persons)
					.where(eq(persons.id, pe.personId))
					.limit(1)
			: [];

		await db
			.update(projectEmployees)
			.set({
				name: employee?.name ?? pe.name,
				role: input.role,
				staffType: input.staffType as (typeof projectEmployees.$inferInsert)['staffType'],
				dateIn: input.dateIn,
				dateOut: input.dateOut,
				cpfApplicable: input.cpfApplicable,
				updatedAt: now
			})
			.where(eq(projectEmployees.id, projectEmployeeId));

		return { ok: true as const };
	}

	async addManualProjectComponent(
		projectId: string,
		projectEmployeeId: string,
		input: {
			label: string;
			incomeType: string;
			ruleType: string;
			value: number;
			frequency: string;
			effectiveFrom: string;
			taxable: boolean;
		}
	) {
		const [pe] = await this.ctx.db
			.select({ id: projectEmployees.id })
			.from(projectEmployees)
			.where(
				and(
					eq(projectEmployees.id, projectEmployeeId),
					eq(projectEmployees.projectId, projectId),
					isNull(projectEmployees.deletedAt)
				)
			)
			.limit(1);

		if (!pe) return { ok: false as const, message: 'Assignment not found.' };

		const now = new Date().toISOString();
		await this.ctx.db.insert(compensationComponents).values({
			id: crypto.randomUUID(),
			projectEmployeeId,
			origin: 'manual',
			employeeCompensationComponentId: null,
			label: input.label,
			incomeType: input.incomeType as (typeof compensationComponents.$inferInsert)['incomeType'],
			ruleType: input.ruleType as (typeof compensationComponents.$inferInsert)['ruleType'],
			value: Number.isFinite(input.value) ? input.value : 0,
			floor: null,
			cap: null,
			frequency: input.frequency as (typeof compensationComponents.$inferInsert)['frequency'],
			taxable: input.taxable,
			effectiveFrom: input.effectiveFrom,
			effectiveTo: null,
			createdAt: now,
			updatedAt: now
		});

		return { ok: true as const };
	}

	async removeManualProjectComponent(projectEmployeeId: string, componentId: string) {
		const now = new Date().toISOString();
		await this.ctx.db
			.update(compensationComponents)
			.set({ deletedAt: now, updatedAt: now })
			.where(
				and(
					eq(compensationComponents.id, componentId),
					eq(compensationComponents.projectEmployeeId, projectEmployeeId),
					or(eq(compensationComponents.origin, 'manual'), isNull(compensationComponents.origin)),
					isNull(compensationComponents.deletedAt)
				)
			);

		return { ok: true as const };
	}

	async settleCompanyAllocationForProjectEmployee(projectId: string, projectEmployeeId: string, monthYm: string) {
		const [pe] = await this.ctx.db
			.select()
			.from(projectEmployees)
			.where(
				and(
					eq(projectEmployees.id, projectEmployeeId),
					eq(projectEmployees.projectId, projectId),
					isNull(projectEmployees.deletedAt)
				)
			)
			.limit(1);

		if (!pe) return { ok: false as const, message: 'Assignment not found.' };
		if (!pe.personId) return { ok: false as const, message: 'Assignment has no linked person.' };

		return this.settlement.settleCompanyAllocation({
			projectId,
			peId: projectEmployeeId,
			employeeId: pe.personId,
			monthYm
		});
	}

	async settleProjectComponentsForProjectEmployee(projectId: string, projectEmployeeId: string, monthYm: string) {
		const [pe] = await this.ctx.db
			.select({ id: projectEmployees.id })
			.from(projectEmployees)
			.where(
				and(
					eq(projectEmployees.id, projectEmployeeId),
					eq(projectEmployees.projectId, projectId),
					isNull(projectEmployees.deletedAt)
				)
			)
			.limit(1);
		if (!pe) return { ok: false as const, message: 'Assignment not found.' };

		const lines = await this.settlement.settleProjectComponents({
			projectId,
			peId: projectEmployeeId,
			monthYm
		});

		if (lines === 0) {
			return {
				ok: false as const,
				message:
					'No settle-eligible project components for this month. Currently supported: monthly and one_off manual components.'
			};
		}

		return {
			ok: true as const,
			lines,
			message: `Recorded ${lines} project component payout line(s) for ${monthYm} (confirmed).`
		};
	}
}

// ---------------------------------------------------------------------------
// AllocationService
// ---------------------------------------------------------------------------

export class AllocationService {
	private repo: AllocationRepository;

	constructor(private ctx: ModuleContext) {
		this.repo = new AllocationRepository(ctx.db);
	}

	async getByEmployee(employeeId: string) {
		return this.repo.findByEmployee(employeeId);
	}

	async getByProject(projectId: string) {
		return this.repo.findByProject(projectId);
	}

	async saveAllocations(employeeId: string, allocations: { projectId: string; weightPct: number; effectiveFrom: string }[]) {
		// Soft-delete existing allocations
		const existing = await this.repo.findByEmployee(employeeId);
		for (const alloc of existing) {
			await this.repo.softDelete(alloc.id);
		}
		// Create new allocations
		for (const alloc of allocations) {
			await this.repo.create({
				employeeId,
				projectId: alloc.projectId,
				weightPct: alloc.weightPct,
				allocationMode: 'manual',
				effectiveFrom: alloc.effectiveFrom
			});
			await this.ctx.eventBus.emit(
				createEvent('allocation.updated', 'employee', {
					personId: employeeId,
					projectId: alloc.projectId,
					weightPct: alloc.weightPct
				})
			);
		}
	}
}
