import { asc, eq, isNull } from 'drizzle-orm';
import type { DBClient } from '../../../infrastructure/db';
import { businessPartners, persons } from '../../../infrastructure/db/schema';

/**
 * Local (modular-monolith) implementations of project's cross-module lookups.
 * These read other modules' tables directly via the shared D1 client. When a
 * module is extracted into its own service, swap these for the HTTP clients in
 * `http-adapters.ts` behind the same `integrations/contracts.ts` interfaces.
 *
 * (Mirrors `finance/integrations/local-adapters.ts`. The existing repository
 * joins that enrich projects with customer/owner names remain the live path;
 * these named lookups are the formalised seam future wiring resolves through.)
 */

export type ProjectCustomerLookupRow = {
	id: string;
	name: string;
};

export async function findProjectCustomer(
	db: DBClient,
	customerId: string
): Promise<ProjectCustomerLookupRow | null> {
	const [row] = await db
		.select({ id: businessPartners.id, name: businessPartners.name })
		.from(businessPartners)
		.where(eq(businessPartners.id, customerId))
		.limit(1);

	return row ?? null;
}

export type ProjectPersonLookupRow = {
	id: string;
	name: string;
};

export async function findProjectPerson(
	db: DBClient,
	personId: string
): Promise<ProjectPersonLookupRow | null> {
	const [row] = await db
		.select({ id: persons.id, name: persons.name })
		.from(persons)
		.where(eq(persons.id, personId))
		.limit(1);

	return row ?? null;
}

export async function listProjectPeople(db: DBClient): Promise<ProjectPersonLookupRow[]> {
	return db
		.select({ id: persons.id, name: persons.name })
		.from(persons)
		.where(isNull(persons.deletedAt))
		.orderBy(asc(persons.name));
}

export type ProjectCustomerDirectoryRow = {
	id: string;
	name: string;
};

export async function listProjectCustomers(
	db: DBClient
): Promise<ProjectCustomerDirectoryRow[]> {
	return db
		.select({ id: businessPartners.id, name: businessPartners.name })
		.from(businessPartners)
		.orderBy(asc(businessPartners.name));
}
