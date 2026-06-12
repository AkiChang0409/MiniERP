import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { DBClient } from '../../../infrastructure/db';
import { businessPartners, persons, projects } from '../../../infrastructure/db/schema';

/**
 * Local (modular-monolith) implementations of finance's cross-module lookups.
 * These read other modules' tables directly via the shared D1 client. When a
 * module is extracted into its own service, swap these for the HTTP clients in
 * `http-adapters.ts` behind the same `integrations/contracts.ts` interfaces.
 */

export type FinanceProjectLookupRow = {
	id: string;
	name: string;
	customerName: string | null;
	status: string;
	startDate: string | null;
	endDate: string | null;
};

export async function findFinanceProjectLookup(
	db: DBClient,
	projectId: string
): Promise<FinanceProjectLookupRow | null> {
	const [row] = await db
		.select({
			id: projects.id,
			name: projects.name,
			status: projects.status,
			startDate: projects.startDate,
			endDate: projects.endDate,
			customerName: businessPartners.name
		})
		.from(projects)
		.leftJoin(businessPartners, eq(projects.businessPartnerId, businessPartners.id))
		.where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
		.limit(1);

	return row ?? null;
}

export async function listFinanceProjectNames(
	db: DBClient,
	projectIds: string[]
): Promise<Map<string, string | null>> {
	if (projectIds.length === 0) return new Map();

	const rows = await db
		.select({
			id: projects.id,
			name: projects.name
		})
		.from(projects)
		.where(and(inArray(projects.id, projectIds), isNull(projects.deletedAt)));

	return new Map(rows.map((row) => [row.id, row.name]));
}

export type FinanceEmployeeDirectoryRow = {
	id: string;
	name: string;
};

export async function listFinanceEmployees(db: DBClient): Promise<FinanceEmployeeDirectoryRow[]> {
	return db
		.select({
			id: persons.id,
			name: persons.name
		})
		.from(persons)
		.where(isNull(persons.deletedAt))
		.orderBy(asc(persons.name));
}

export async function findFinanceEmployeeNameById(
	db: DBClient,
	employeeId: string
): Promise<string | null> {
	const [row] = await db
		.select({ name: persons.name })
		.from(persons)
		.where(eq(persons.id, employeeId))
		.limit(1);

	return row?.name ?? null;
}
