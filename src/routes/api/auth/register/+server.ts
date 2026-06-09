import type { RequestHandler } from './$types';
import { getAuth } from '$platform/auth/better-auth';
import { resolveWorkerAuthEnv } from '$platform/auth/resolve-worker-env';
import { parseRoles, type AuthRole } from '$platform/auth/config';
import { UserRepository } from '$platform/auth/user-repository';
import { InviteCodeRepository } from '$platform/auth/invite-code-repository';
import { UserPersonLinkRepository } from '$platform/auth/user-person-link-repository';
import { AuditRepository } from '$platform/audit/audit-repository';
import { createWorkerContext } from '$platform/modules';
import { ok, fail } from '$platform/http';

export const POST: RequestHandler = async (event) => {
	const env = resolveWorkerAuthEnv(event);
	if (!env) return fail('Server not configured', 500);

	let body: { name?: string; email?: string; password?: string; inviteCode?: string };
	try {
		body = await event.request.json();
	} catch {
		return fail('Invalid JSON body', 400);
	}

	const name = body.name?.trim();
	const email = body.email?.trim().toLowerCase();
	const password = body.password;
	const inviteCode = body.inviteCode?.trim();

	if (!name || !email || !password) {
		return fail('name, email and password are required', 400);
	}
	if (password.length < 8) {
		return fail('Password must be at least 8 characters', 400);
	}

	const ctx = await createWorkerContext(env);
	const userRepo = new UserRepository(ctx.db);
	const inviteRepo = new InviteCodeRepository(ctx.db);
	const auditRepo = new AuditRepository(ctx.db);

	const activeCount = await userRepo.countActive();
	let roles: AuthRole[];
	let inviteCodeId: string | null = null;
	let linkedPersonId: string | null = null;

	if (activeCount === 0) {
		roles = ['owner'];
	} else {
		if (!inviteCode) {
			return fail('Invite code is required', 400);
		}
		const code = await inviteRepo.findByCode(inviteCode);
		if (!code) {
			return fail('Invalid or expired invite code', 400);
		}
		const parsed = parseRoles(code.roles);
		if (parsed.length === 0 || (parsed.length === 1 && parsed[0] === 'employee')) {
			roles = parsed;
		} else {
			roles = parsed;
		}
		inviteCodeId = code.id;
		// Identity binding is fixed on the invite, never supplied by the registrant.
		linkedPersonId = code.linkedPersonId ?? null;
	}

	const rolesJson = JSON.stringify(roles);

	const auth = getAuth(env);
	try {
		const result = await (auth.api.signUpEmail as Function)({
			body: {
				name,
				email,
				password,
				role: rolesJson
			}
		});

		if (!result?.user?.id) {
			return fail('Registration failed', 500);
		}

		if (inviteCodeId) {
			await inviteRepo.consume(inviteCodeId, result.user.id);
			await auditRepo.writeLog(null, {
				action: 'invite_code.consumed',
				entityType: 'invite_code',
				entityId: inviteCodeId,
				module: 'core',
				actionType: 'update',
				ipAddress: event.getClientAddress(),
				metadata: { usedBy: result.user.id, email }
			});
		}

		// Bind the new account to its HR person if the invite carried one. The
		// account already exists, so a binding failure (person already linked,
		// or partial unique-index race) must not orphan it — record the failure
		// for manual follow-up and let registration succeed.
		if (linkedPersonId) {
			const linkRepo = new UserPersonLinkRepository(ctx.db);
			try {
				await linkRepo.linkUserToPerson(result.user.id, linkedPersonId);
				await auditRepo.writeLog(null, {
					action: 'user.person_linked',
					entityType: 'user',
					entityId: result.user.id,
					module: 'core',
					actionType: 'update',
					ipAddress: event.getClientAddress(),
					metadata: { personId: linkedPersonId, inviteCodeId }
				});
			} catch (linkErr: unknown) {
				await auditRepo.writeLog(null, {
					action: 'user.person_link_failed',
					entityType: 'user',
					entityId: result.user.id,
					module: 'core',
					actionType: 'update',
					ipAddress: event.getClientAddress(),
					metadata: {
						personId: linkedPersonId,
						inviteCodeId,
						error: linkErr instanceof Error ? linkErr.message : String(linkErr)
					}
				});
			}
		}

		await auditRepo.writeLog(null, {
			action: 'user.registered',
			entityType: 'user',
			entityId: result.user.id,
			module: 'core',
			actionType: 'create',
			ipAddress: event.getClientAddress(),
			metadata: {
				roles,
				inviteCodeId,
				isFirstUser: activeCount === 0
			}
		});

		return ok({ userId: result.user.id, roles }, 201);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Registration failed';
		return fail(message, 400);
	}
};

export const GET: RequestHandler = async (event) => {
	const env = resolveWorkerAuthEnv(event);
	if (!env) return fail('Server not configured', 500);

	const ctx = await createWorkerContext(env);
	const userRepo = new UserRepository(ctx.db);
	const count = await userRepo.countActive();

	return ok({ isFirstUser: count === 0 });
};
