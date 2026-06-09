import { and, asc, between, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { ModuleContext } from '$platform/modules/types';
import { schema } from '$infrastructure/db';
import { estimateSingaporeResidentTax } from '$modules/finance/rules';

type EmployeeProfileInput = {
	name: string;
	type: string;
	status: string;
	startDate: string;
	endDate: string;
	contact: string;
	taxId: string;
	taxResidentLabel?: string;
	cpfApplicable?: boolean;
};

type CompanyComponentInput = {
	label: string;
	incomeType: string;
	ruleType: string;
	value: number;
	frequency: string;
	effectiveFrom: string;
	taxable: boolean;
};

export class EmployeeMasterService {
	constructor(private ctx: ModuleContext) {}

	async listEmployees() {
		// Wave 2.2: legacy employees table dropped. Compose persons + employee_profiles
		// to surface the v3 employee shape (type / status / dates / cpf / taxResident).
		const rows = await this.ctx.db
			.select({
				id: schema.persons.id,
				name: schema.persons.name,
				email: schema.persons.email,
				phone: schema.persons.phone,
				taxId: schema.persons.taxId,
				metadata: schema.persons.metadata,
				createdAt: schema.persons.createdAt,
				updatedAt: schema.persons.updatedAt,
				deletedAt: schema.persons.deletedAt,
				type: schema.employeeProfiles.employmentType,
				status: schema.employeeProfiles.status,
				startDate: schema.employeeProfiles.startDate,
				endDate: schema.employeeProfiles.endDate,
				contact: schema.persons.email,
				cpfApplicable: schema.employeeProfiles.cpfApplicable,
				taxResidentLabel: schema.employeeProfiles.taxResidentLabel
			})
			.from(schema.persons)
			.leftJoin(
				schema.employeeProfiles,
				eq(schema.persons.id, schema.employeeProfiles.personId)
			)
			.where(isNull(schema.persons.deletedAt))
			.orderBy(desc(schema.persons.updatedAt));
		return rows;
	}

	/**
	 * Persons that can be bound to a login account: active employee_profiles
	 * only. Excluding already-linked persons is the caller's job (it needs the
	 * platform-owned user_person_links table), keeping this query inside the HR
	 * boundary.
	 */
	async listLinkableEmployees() {
		return this.ctx.db
			.select({
				id: schema.persons.id,
				name: schema.persons.name,
				email: schema.persons.email
			})
			.from(schema.persons)
			.innerJoin(
				schema.employeeProfiles,
				eq(schema.persons.id, schema.employeeProfiles.personId)
			)
			.where(
				and(
					isNull(schema.persons.deletedAt),
					isNull(schema.employeeProfiles.deletedAt),
					eq(schema.employeeProfiles.status, 'active')
				)
			)
			.orderBy(asc(schema.persons.name));
	}

	async createEmployeeProfile(data: EmployeeProfileInput) {
		const id = crypto.randomUUID();
		const profileId = crypto.randomUUID();
		const now = new Date().toISOString();

		await this.ctx.db.insert(schema.persons).values({
			id,
			name: data.name,
			email: data.contact || null,
			taxId: data.taxId || null,
			metadata: null,
			createdAt: now,
			updatedAt: now
		});

		await this.ctx.db.insert(schema.employeeProfiles).values({
			id: profileId,
			personId: id,
			employmentType: data.type as (typeof schema.employeeProfiles.$inferInsert)['employmentType'],
			status: data.status,
			startDate: data.startDate || null,
			endDate: data.endDate || null,
			cpfApplicable: data.cpfApplicable ?? true,
			taxResidentLabel: data.taxResidentLabel || null,
			metadata: null,
			createdAt: now,
			updatedAt: now
		});

		return { id };
	}

	async getEmployeeDetailPage(employeeId: string, taxYearParam: string | null) {
		const db = this.ctx.db;
		const [employee] = await db
			.select({
				id: schema.persons.id,
				name: schema.persons.name,
				email: schema.persons.email,
				phone: schema.persons.phone,
				taxId: schema.persons.taxId,
				metadata: schema.persons.metadata,
				createdAt: schema.persons.createdAt,
				updatedAt: schema.persons.updatedAt,
				deletedAt: schema.persons.deletedAt,
				type: schema.employeeProfiles.employmentType,
				status: schema.employeeProfiles.status,
				startDate: schema.employeeProfiles.startDate,
				endDate: schema.employeeProfiles.endDate,
				contact: schema.persons.email,
				cpfApplicable: schema.employeeProfiles.cpfApplicable,
				taxResidentLabel: schema.employeeProfiles.taxResidentLabel
			})
			.from(schema.persons)
			.leftJoin(
				schema.employeeProfiles,
				eq(schema.persons.id, schema.employeeProfiles.personId)
			)
			.where(and(eq(schema.persons.id, employeeId), isNull(schema.persons.deletedAt)))
			.limit(1);

		if (!employee) return null;

		const calendarYear = new Date().getFullYear();
		const parsedYear = Number.parseInt(taxYearParam ?? String(calendarYear), 10);
		const taxYear =
			Number.isFinite(parsedYear) && parsedYear >= 2000 && parsedYear <= calendarYear + 1
				? parsedYear
				: calendarYear;
		const periodStart = `${taxYear}-01-01`;
		const periodEnd = `${taxYear}-12-31`;

		const payoutTaxFilter = and(
			eq(schema.projectEmployees.personId, employeeId),
			between(schema.payoutRecords.period, periodStart, periodEnd),
			inArray(schema.payoutRecords.status, ['confirmed', 'paid'])
		);

		const [companyComponents, allocations, participation, taxAgg, taxByIncomeType] = await Promise.all([
			db
				.select()
				.from(schema.employeeCompensationComponents)
				.where(
					and(
						eq(schema.employeeCompensationComponents.employeeId, employeeId),
						isNull(schema.employeeCompensationComponents.deletedAt)
					)
				)
				.orderBy(desc(schema.employeeCompensationComponents.effectiveFrom)),
			db
				.select({
					id: schema.employeeProjectAllocations.id,
					projectId: schema.employeeProjectAllocations.projectId,
					projectName: schema.projects.name,
					weightPct: schema.employeeProjectAllocations.weightPct,
					allocationMode: schema.employeeProjectAllocations.allocationMode,
					effectiveFrom: schema.employeeProjectAllocations.effectiveFrom
				})
				.from(schema.employeeProjectAllocations)
				.innerJoin(schema.projects, eq(schema.employeeProjectAllocations.projectId, schema.projects.id))
				.where(
					and(
						eq(schema.employeeProjectAllocations.employeeId, employeeId),
						isNull(schema.employeeProjectAllocations.deletedAt),
						isNull(schema.projects.deletedAt)
					)
				)
				.orderBy(asc(schema.projects.name)),
			db
				.select({
					peId: schema.projectEmployees.id,
					projectId: schema.projectEmployees.projectId,
					projectName: schema.projects.name,
					role: schema.projectEmployees.role,
					dateIn: schema.projectEmployees.dateIn,
					dateOut: schema.projectEmployees.dateOut,
					staffType: schema.projectEmployees.staffType
				})
				.from(schema.projectEmployees)
				.innerJoin(schema.projects, eq(schema.projectEmployees.projectId, schema.projects.id))
				.where(
					and(
						eq(schema.projectEmployees.personId, employeeId),
						isNull(schema.projectEmployees.deletedAt),
						isNull(schema.projects.deletedAt)
					)
				)
				.orderBy(asc(schema.projects.name)),
			db
				.select({
					taxableTotal: sql<number>`coalesce(sum(${schema.payoutRecords.taxableAmount}), 0)`,
					computedTotal: sql<number>`coalesce(sum(${schema.payoutRecords.computedAmount}), 0)`,
					cpfEmployeeTotal: sql<number>`coalesce(sum(${schema.payoutRecords.cpfEmployee}), 0)`,
					payoutCount: sql<number>`count(*)`
				})
				.from(schema.payoutRecords)
				.innerJoin(
					schema.compensationComponents,
					eq(schema.payoutRecords.componentId, schema.compensationComponents.id)
				)
				.innerJoin(
					schema.projectEmployees,
					eq(schema.compensationComponents.projectEmployeeId, schema.projectEmployees.id)
				)
				.where(payoutTaxFilter),
			db
				.select({
					incomeType: schema.compensationComponents.incomeType,
					computedSum: sql<number>`coalesce(sum(${schema.payoutRecords.computedAmount}), 0)`,
					taxableSum: sql<number>`coalesce(sum(${schema.payoutRecords.taxableAmount}), 0)`,
					cpfEmployeeSum: sql<number>`coalesce(sum(${schema.payoutRecords.cpfEmployee}), 0)`,
					lineCount: sql<number>`count(*)`
				})
				.from(schema.payoutRecords)
				.innerJoin(
					schema.compensationComponents,
					eq(schema.payoutRecords.componentId, schema.compensationComponents.id)
				)
				.innerJoin(
					schema.projectEmployees,
					eq(schema.compensationComponents.projectEmployeeId, schema.projectEmployees.id)
				)
				.where(payoutTaxFilter)
				.groupBy(schema.compensationComponents.incomeType)
		]);

		const allocationByProjectId = Object.fromEntries(allocations.map((a) => [a.projectId, a.weightPct] as const));

		const [aggRow] = taxAgg;
		const taxableTotal = aggRow?.taxableTotal ?? 0;
		const cpfEmployeeTotal = aggRow?.cpfEmployeeTotal ?? 0;
		const chargeableBeforeOtherReliefs = taxableTotal - cpfEmployeeTotal;
		const estimatedResidentTax = estimateSingaporeResidentTax(chargeableBeforeOtherReliefs);

		const byIncomeType = [...taxByIncomeType].sort((a, b) =>
			String(a.incomeType).localeCompare(String(b.incomeType))
		);

		return {
			employee,
			companyComponents,
			allocations,
			allocationByProjectId,
			participation,
			individualTax: {
				year: taxYear,
				range: { start: periodStart, end: periodEnd },
				payoutCount: aggRow?.payoutCount ?? 0,
				taxableTotal,
				computedTotal: aggRow?.computedTotal ?? 0,
				cpfEmployeeTotal,
				chargeableBeforeOtherReliefs,
				estimatedResidentTax,
				byIncomeType,
				note:
					'Figures sum project-linked payout lines (status confirmed or paid) in the selected calendar year. IRAS reliefs beyond employee CPF are not stored; estimated tax uses resident progressive bands for illustration only �?verify with IRAS / your tax advisor.'
			}
		};
	}

	async updateEmployeeProfile(employeeId: string, data: EmployeeProfileInput) {
		const now = new Date().toISOString();

		await this.ctx.db
			.update(schema.persons)
			.set({
				name: data.name,
				email: data.contact || null,
				taxId: data.taxId || null,
				updatedAt: now
			})
			.where(and(eq(schema.persons.id, employeeId), isNull(schema.persons.deletedAt)));

		await this.ctx.db
			.update(schema.employeeProfiles)
			.set({
				employmentType:
					data.type as (typeof schema.employeeProfiles.$inferInsert)['employmentType'],
				status: data.status,
				startDate: data.startDate || null,
				endDate: data.endDate || null,
				cpfApplicable: data.cpfApplicable ?? false,
				taxResidentLabel: data.taxResidentLabel || null,
				updatedAt: now
			})
			.where(
				and(
					eq(schema.employeeProfiles.personId, employeeId),
					isNull(schema.employeeProfiles.deletedAt)
				)
			);
	}

	async addCompanyComponent(employeeId: string, data: CompanyComponentInput) {
		await this.ctx.db.insert(schema.employeeCompensationComponents).values({
			id: crypto.randomUUID(),
			employeeId,
			label: data.label,
			incomeType: data.incomeType as (typeof schema.employeeCompensationComponents.$inferInsert)['incomeType'],
			ruleType: data.ruleType as (typeof schema.employeeCompensationComponents.$inferInsert)['ruleType'],
			value: Number.isFinite(data.value) ? data.value : 0,
			floor: null,
			cap: null,
			frequency: data.frequency as (typeof schema.employeeCompensationComponents.$inferInsert)['frequency'],
			taxable: data.taxable,
			effectiveFrom: data.effectiveFrom,
			effectiveTo: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
	}

	async removeCompanyComponent(employeeId: string, componentId: string) {
		const now = new Date().toISOString();
		await this.ctx.db
			.update(schema.employeeCompensationComponents)
			.set({ deletedAt: now, updatedAt: now })
			.where(
				and(
					eq(schema.employeeCompensationComponents.id, componentId),
					eq(schema.employeeCompensationComponents.employeeId, employeeId),
					isNull(schema.employeeCompensationComponents.deletedAt)
				)
			);
	}

	async saveEmployeeProjectAllocations(
		employeeId: string,
		input: { effectiveFrom: string; weightsByProjectId: Record<string, string> }
	) {
		const effectiveFrom = input.effectiveFrom.trim() || new Date().toISOString().slice(0, 10);
		const participating = await this.ctx.db
			.select({ projectId: schema.projectEmployees.projectId })
			.from(schema.projectEmployees)
			.where(and(eq(schema.projectEmployees.personId, employeeId), isNull(schema.projectEmployees.deletedAt)));

		const weights: { projectId: string; pct: number }[] = [];
		for (const row of participating) {
			const raw = String(input.weightsByProjectId[row.projectId] ?? '').trim();
			if (!raw) continue;
			const pct = Number.parseFloat(raw);
			if (!Number.isFinite(pct) || pct <= 0) continue;
			weights.push({ projectId: row.projectId, pct });
		}

		const sum = weights.reduce((total, row) => total + row.pct, 0);
		if (weights.length > 0 && Math.abs(sum - 100) > 0.02) {
			return {
				ok: false as const,
				message: `Project weights must sum to 100% (currently ${sum.toFixed(2)}%).`
			};
		}

		const now = new Date().toISOString();
		await this.ctx.db
			.update(schema.employeeProjectAllocations)
			.set({ deletedAt: now, updatedAt: now })
			.where(
				and(
					eq(schema.employeeProjectAllocations.employeeId, employeeId),
					isNull(schema.employeeProjectAllocations.deletedAt)
				)
			);

		for (const row of weights) {
			await this.ctx.db.insert(schema.employeeProjectAllocations).values({
				id: crypto.randomUUID(),
				employeeId,
				projectId: row.projectId,
				weightPct: row.pct,
				allocationMode: 'manual',
				effectiveFrom,
				effectiveTo: null,
				createdAt: now,
				updatedAt: now
			});
		}

		return { ok: true as const };
	}

	async deleteEmployee(employeeId: string) {
		const now = new Date().toISOString();
		await this.ctx.db
			.update(schema.persons)
			.set({ deletedAt: now, updatedAt: now })
			.where(and(eq(schema.persons.id, employeeId), isNull(schema.persons.deletedAt)));
		await this.ctx.db
			.update(schema.employeeProfiles)
			.set({ deletedAt: now, updatedAt: now, status: 'inactive' })
			.where(
				and(
					eq(schema.employeeProfiles.personId, employeeId),
					isNull(schema.employeeProfiles.deletedAt)
				)
			);
	}
}
