import { describe, it, expect, beforeAll, inject } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq } from 'drizzle-orm';
import { createEmployeeLeaveApi, LeaveValidationError } from '$modules/hr';
import { resolveCurrentPersonId } from '$platform/auth/resolve-current-person';
import { createEventBus } from '$platform/events/index';
import * as schema from '$infrastructure/db/schema';
import type { ModuleContext } from '$platform/modules/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCtx(): ModuleContext {
	return {
		db: drizzle(env.DB, { schema }),
		// An employee-role login. Note: identity (the link) is orthogonal to role.
		user: { id: 'user-emp', email: 'emp@test.com', roles: ['employee' as const] },
		env: env as any,
		eventBus: createEventBus()
	};
}

const now = new Date().toISOString();
const nowMs = new Date();

async function seedUser(db: ReturnType<typeof drizzle>, id: string, email: string) {
	await db
		.insert(schema.users)
		.values({ id, email, name: email, role: '["employee"]', createdAt: nowMs, updatedAt: nowMs });
}

async function seedPerson(db: ReturnType<typeof drizzle>, id: string, name: string) {
	await db.insert(schema.persons).values({ id, name, createdAt: now, updatedAt: now });
}

async function seedEmployeeProfile(
	db: ReturnType<typeof drizzle>,
	id: string,
	personId: string,
	status = 'active'
) {
	await db.insert(schema.employeeProfiles).values({
		id,
		personId,
		employmentType: 'full_time',
		status,
		createdAt: now,
		updatedAt: now
	});
}

async function seedLink(db: ReturnType<typeof drizzle>, id: string, userId: string, personId: string) {
	await db
		.insert(schema.userPersonLinks)
		.values({ id, userId, personId, status: 'active', createdAt: now, updatedAt: now });
}

async function seedLeaveType(
	db: ReturnType<typeof drizzle>,
	id: string,
	code: string,
	name: string,
	affectsPayroll = false
) {
	await db
		.insert(schema.leaveTypes)
		.values({ id, code, name, affectsPayroll, createdAt: now, updatedAt: now });
}

async function seedBalance(
	db: ReturnType<typeof drizzle>,
	id: string,
	personId: string,
	leaveTypeId: string,
	opts: { year?: number; entitledDays?: number; usedDays?: number; pendingDays?: number } = {}
) {
	await db.insert(schema.leaveBalances).values({
		id,
		personId,
		leaveTypeId,
		year: opts.year ?? new Date().getFullYear(),
		entitledDays: opts.entitledDays ?? 14,
		usedDays: opts.usedDays ?? 0,
		pendingDays: opts.pendingDays ?? 0,
		createdAt: now,
		updatedAt: now
	});
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
	await applyD1Migrations(env.DB, inject('d1Migrations'));
});

// ─── 1. Linked user resolves personId and views own balances / requests ───────

describe('employee leave — linked user', () => {
	it('resolves personId from user_person_links and reads own balances + requests', async () => {
		const ctx = makeCtx();
		const { db } = ctx;

		await seedUser(db, 'u-link-1', 'link1@test.com');
		await seedPerson(db, 'p-link-1', 'Linked Lily');
		await seedEmployeeProfile(db, 'ep-link-1', 'p-link-1');
		await seedLink(db, 'upl-link-1', 'u-link-1', 'p-link-1');
		await seedLeaveType(db, 'lt-link-annual', 'ANNUAL_L1', 'Annual L1');
		await seedBalance(db, 'lb-link-1', 'p-link-1', 'lt-link-annual', {
			entitledDays: 14,
			usedDays: 2,
			pendingDays: 1
		});

		const personId = await resolveCurrentPersonId(db, 'u-link-1');
		expect(personId).toBe('p-link-1');

		const api = createEmployeeLeaveApi(ctx, personId!);
		expect(await api.getProfileStatus()).toBe('active');

		const balances = await api.listMyBalances();
		const annual = balances.find((b) => b.id === 'lb-link-1');
		expect(annual).toBeDefined();
		expect(annual!.remainingDays).toBe(11); // 14 - 2 - 1

		// All returned balances belong to this person.
		expect(balances.every((b) => b.personId === 'p-link-1')).toBe(true);

		const requests = await api.listMyRequests();
		expect(requests.every((r) => r.personId === 'p-link-1')).toBe(true);
	});

	it('only returns the current person\'s requests, never another employee\'s', async () => {
		const ctx = makeCtx();
		const { db } = ctx;

		await seedUser(db, 'u-iso', 'iso@test.com');
		await seedPerson(db, 'p-iso-me', 'Iso Me');
		await seedPerson(db, 'p-iso-other', 'Iso Other');
		await seedEmployeeProfile(db, 'ep-iso-me', 'p-iso-me');
		await seedLink(db, 'upl-iso', 'u-iso', 'p-iso-me');
		await seedLeaveType(db, 'lt-iso', 'ANNUAL_ISO', 'Annual Iso');

		await db.insert(schema.leaveRequests).values([
			{
				id: 'lr-iso-mine',
				personId: 'p-iso-me',
				leaveTypeId: 'lt-iso',
				startDate: '2026-06-01',
				endDate: '2026-06-02',
				totalDays: 2,
				status: 'pending',
				source: 'employee_portal',
				submittedAt: now,
				createdAt: now,
				updatedAt: now
			},
			{
				id: 'lr-iso-theirs',
				personId: 'p-iso-other',
				leaveTypeId: 'lt-iso',
				startDate: '2026-06-01',
				endDate: '2026-06-02',
				totalDays: 2,
				status: 'pending',
				source: 'employee_portal',
				submittedAt: now,
				createdAt: now,
				updatedAt: now
			}
		]);

		const api = createEmployeeLeaveApi(ctx, 'p-iso-me');
		const ids = (await api.listMyRequests()).map((r) => r.id);
		expect(ids).toContain('lr-iso-mine');
		expect(ids).not.toContain('lr-iso-theirs');
	});
});

// ─── 2. Unlinked user gets null personId (route renders explainer) ─────────────

describe('employee leave — unlinked user', () => {
	it('resolveCurrentPersonId returns null for a user with no active link', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		await seedUser(db, 'u-unlinked', 'unlinked@test.com');

		const personId = await resolveCurrentPersonId(db, 'u-unlinked');
		expect(personId).toBeNull();
	});

	it('reports a non-active profile via getProfileStatus', async () => {
		const ctx = makeCtx();
		const { db } = ctx;

		await seedUser(db, 'u-inactive', 'inactive@test.com');
		await seedPerson(db, 'p-inactive', 'Inactive Ivan');
		await seedEmployeeProfile(db, 'ep-inactive', 'p-inactive', 'inactive');
		await seedLink(db, 'upl-inactive', 'u-inactive', 'p-inactive');

		const personId = await resolveCurrentPersonId(db, 'u-inactive');
		expect(personId).toBe('p-inactive');

		const api = createEmployeeLeaveApi(ctx, personId!);
		expect(await api.getProfileStatus()).not.toBe('active');
	});
});

// ─── 3 & 4. Submit creates pending request and bumps pendingDays ───────────────

describe('employee leave — submitRequest', () => {
	it('creates a pending request (source employee_portal) and increments pendingDays', async () => {
		const ctx = makeCtx();
		const { db } = ctx;

		await seedPerson(db, 'p-sub-1', 'Submit Sam');
		await seedEmployeeProfile(db, 'ep-sub-1', 'p-sub-1');
		await seedLeaveType(db, 'lt-sub-1', 'ANNUAL_SUB', 'Annual Submit');
		await seedBalance(db, 'lb-sub-1', 'p-sub-1', 'lt-sub-1', {
			year: 2026,
			entitledDays: 14,
			usedDays: 0,
			pendingDays: 0
		});

		const api = createEmployeeLeaveApi(ctx, 'p-sub-1');
		const result = await api.submitRequest({
			leaveTypeId: 'lt-sub-1',
			startDate: '2026-06-01',
			endDate: '2026-06-03',
			reason: 'Trip'
		});

		expect(result.totalDays).toBe(3); // inclusive 01,02,03
		expect(result.status).toBe('pending');

		const [req] = await db
			.select()
			.from(schema.leaveRequests)
			.where(eq(schema.leaveRequests.id, result.id));
		expect(req.status).toBe('pending');
		expect(req.source).toBe('employee_portal');
		expect(req.personId).toBe('p-sub-1');
		expect(req.approvedByUserId).toBeNull();

		const [bal] = await db
			.select()
			.from(schema.leaveBalances)
			.where(eq(schema.leaveBalances.id, 'lb-sub-1'));
		expect(bal.pendingDays).toBe(3); // 0 + 3
	});

	it('rejects submission when remaining balance is insufficient', async () => {
		const ctx = makeCtx();
		const { db } = ctx;

		await seedPerson(db, 'p-sub-2', 'Short Shelly');
		await seedEmployeeProfile(db, 'ep-sub-2', 'p-sub-2');
		await seedLeaveType(db, 'lt-sub-2', 'ANNUAL_SUB2', 'Annual Submit 2');
		await seedBalance(db, 'lb-sub-2', 'p-sub-2', 'lt-sub-2', {
			year: 2026,
			entitledDays: 2,
			usedDays: 0,
			pendingDays: 0
		});

		const api = createEmployeeLeaveApi(ctx, 'p-sub-2');
		await expect(
			api.submitRequest({
				leaveTypeId: 'lt-sub-2',
				startDate: '2026-06-01',
				endDate: '2026-06-05', // 5 days > 2 entitled
				reason: 'Too long'
			})
		).rejects.toThrow(LeaveValidationError);

		// No request created, pendingDays unchanged.
		const reqs = await db
			.select()
			.from(schema.leaveRequests)
			.where(eq(schema.leaveRequests.personId, 'p-sub-2'));
		expect(reqs).toHaveLength(0);
		const [bal] = await db
			.select()
			.from(schema.leaveBalances)
			.where(eq(schema.leaveBalances.id, 'lb-sub-2'));
		expect(bal.pendingDays).toBe(0);
	});

	it('rejects when endDate precedes startDate', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		await seedPerson(db, 'p-sub-3', 'Backwards Bob');
		await seedEmployeeProfile(db, 'ep-sub-3', 'p-sub-3');
		await seedLeaveType(db, 'lt-sub-3', 'ANNUAL_SUB3', 'Annual Submit 3');

		const api = createEmployeeLeaveApi(ctx, 'p-sub-3');
		await expect(
			api.submitRequest({
				leaveTypeId: 'lt-sub-3',
				startDate: '2026-06-10',
				endDate: '2026-06-05'
			})
		).rejects.toThrow('End date must be on or after start date');
	});

	it('auto-generates a mock balance when none exists, then submits', async () => {
		const ctx = makeCtx();
		const { db } = ctx;
		await seedPerson(db, 'p-sub-4', 'Fresh Fiona');
		await seedEmployeeProfile(db, 'ep-sub-4', 'p-sub-4');
		await seedLeaveType(db, 'lt-sub-4', 'ANNUAL', 'Annual'); // default entitlement 14

		const api = createEmployeeLeaveApi(ctx, 'p-sub-4');
		const result = await api.submitRequest({
			leaveTypeId: 'lt-sub-4',
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});
		expect(result.totalDays).toBe(1);

		const [bal] = await db
			.select()
			.from(schema.leaveBalances)
			.where(
				and(
					eq(schema.leaveBalances.personId, 'p-sub-4'),
					eq(schema.leaveBalances.leaveTypeId, 'lt-sub-4')
				)
			);
		expect(bal.entitledDays).toBe(14); // auto-seeded
		expect(bal.pendingDays).toBe(1);
	});
});

// ─── 6. Forged personId in payload is ignored — bound personId always wins ─────

describe('employee leave — personId is resolver-bound, not form-supplied', () => {
	it('ignores a forged personId field and writes to the bound person', async () => {
		const ctx = makeCtx();
		const { db } = ctx;

		await seedPerson(db, 'p-real', 'Real Rita');
		await seedPerson(db, 'p-victim', 'Victim Vic');
		await seedEmployeeProfile(db, 'ep-real', 'p-real');
		await seedEmployeeProfile(db, 'ep-victim', 'p-victim');
		await seedLeaveType(db, 'lt-forge', 'ANNUAL_FORGE', 'Annual Forge');
		await seedBalance(db, 'lb-real', 'p-real', 'lt-forge', { year: 2026, entitledDays: 14 });
		await seedBalance(db, 'lb-victim', 'p-victim', 'lt-forge', { year: 2026, entitledDays: 14 });

		const api = createEmployeeLeaveApi(ctx, 'p-real');
		// Simulate a forged form field smuggled into the payload.
		const result = await api.submitRequest({
			leaveTypeId: 'lt-forge',
			startDate: '2026-06-01',
			endDate: '2026-06-02',
			personId: 'p-victim'
		} as any);

		const [req] = await db
			.select()
			.from(schema.leaveRequests)
			.where(eq(schema.leaveRequests.id, result.id));
		expect(req.personId).toBe('p-real'); // bound id wins

		// Victim's balance untouched.
		const [victim] = await db
			.select()
			.from(schema.leaveBalances)
			.where(eq(schema.leaveBalances.id, 'lb-victim'));
		expect(victim.pendingDays).toBe(0);
	});
});

// ─── 7. Employee facade exposes no approve / reject ────────────────────────────

describe('employee leave — no admin actions', () => {
	it('does not expose approve or reject on the employee facade', () => {
		const api = createEmployeeLeaveApi(makeCtx(), 'p-any');
		expect((api as Record<string, unknown>).approveRequest).toBeUndefined();
		expect((api as Record<string, unknown>).rejectRequest).toBeUndefined();
		expect((api as Record<string, unknown>).approve).toBeUndefined();
		expect((api as Record<string, unknown>).reject).toBeUndefined();
	});
});
