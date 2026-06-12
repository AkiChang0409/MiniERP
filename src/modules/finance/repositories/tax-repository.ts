import { eq, isNull, and, desc } from 'drizzle-orm';
import type { DBClient } from '$infrastructure/db';
import { gstReturns, personIncome, timeLogs } from './tax.schema';
import { BaseRepository } from '$platform/modules/base-repository';

// ---------------------------------------------------------------------------
// GstReturnRepository
// ---------------------------------------------------------------------------

export class GstReturnRepository extends BaseRepository<typeof gstReturns> {
	constructor(db: DBClient) {
		super(db, gstReturns);
	}

	async findByQuarter(year: string, quarter: string) {
		const rows = await this.db
			.select()
			.from(gstReturns)
			.where(
				and(
					eq(gstReturns.year, year),
					eq(gstReturns.quarter, quarter),
					isNull(gstReturns.deletedAt)
				)
			)
			.limit(1);
		return rows[0] ?? null;
	}
}

// ---------------------------------------------------------------------------
// PersonIncomeRepository
// ---------------------------------------------------------------------------

export class PersonIncomeRepository extends BaseRepository<typeof personIncome> {
	constructor(db: DBClient) {
		super(db, personIncome);
	}

	async findByPerson(personId: string, yearOfAssessment?: string) {
		const conditions = [eq(personIncome.personId, personId), isNull(personIncome.deletedAt)];
		if (yearOfAssessment) {
			conditions.push(eq(personIncome.yearOfAssessment, yearOfAssessment));
		}
		return this.db
			.select()
			.from(personIncome)
			.where(and(...conditions))
			.orderBy(desc(personIncome.createdAt));
	}

	async findBySource(sourceId: string) {
		const rows = await this.db
			.select()
			.from(personIncome)
			.where(and(eq(personIncome.sourceId, sourceId), isNull(personIncome.deletedAt)))
			.limit(1);
		return rows[0] ?? null;
	}
}

// ---------------------------------------------------------------------------
// TimeLogRepository
// ---------------------------------------------------------------------------

export class TimeLogRepository extends BaseRepository<typeof timeLogs> {
	constructor(db: DBClient) {
		super(db, timeLogs);
	}

	async findByPersonAndProject(personId: string, projectId: string) {
		return this.db
			.select()
			.from(timeLogs)
			.where(
				and(
					eq(timeLogs.personId, personId),
					eq(timeLogs.projectId, projectId),
					isNull(timeLogs.deletedAt)
				)
			)
			.orderBy(desc(timeLogs.date));
	}

	async findByPersonAndDateRange(personId: string, startDate: string, endDate: string) {
		const { between } = await import('drizzle-orm');
		return this.db
			.select()
			.from(timeLogs)
			.where(
				and(
					eq(timeLogs.personId, personId),
					isNull(timeLogs.deletedAt),
					between(timeLogs.date, startDate, endDate)
				)
			)
			.orderBy(desc(timeLogs.date));
	}
}
