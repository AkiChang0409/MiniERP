import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { createModuleContext } from '$platform/modules';
import { InviteCodeRepository } from '$platform/auth/invite-code-repository';
import { UserPersonLinkRepository } from '$platform/auth/user-person-link-repository';
import { AuditRepository } from '$platform/audit/audit-repository';
import { parseRoles, authRoles, type AuthRole } from '$platform/auth/config';
import { createEmployeeApi } from '$modules/hr';

function generateCode(): string {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user || !user.roles.some((r) => r === 'owner' || r === 'admin')) {
		throw redirect(303, '/settings');
	}

	const ctx = await createModuleContext(event);
	const repo = new InviteCodeRepository(ctx.db);
	const rawInvites = await repo.listAll();

	const now = new Date().toISOString();
	const invites = rawInvites.map((inv) => ({
		...inv,
		roles: parseRoles(inv.roles),
		isExpired: inv.expiresAt < now,
		isFullyUsed: inv.useCount >= inv.maxUses
	}));

	// Employees selectable for an employee invite: active employee_profiles that
	// are not already bound to an account. The exclusion lives here (not in the
	// HR query) because it needs the platform-owned user_person_links table.
	const [linkableEmployees, linkedPersonIds] = await Promise.all([
		createEmployeeApi(ctx).listLinkableEmployees(),
		new UserPersonLinkRepository(ctx.db).listActiveLinkedPersonIds()
	]);
	const linkedSet = new Set(linkedPersonIds);
	const linkablePersons = linkableEmployees.filter((p) => !linkedSet.has(p.id));

	return { invites, allRoles: [...authRoles], linkablePersons };
};

export const actions: Actions = {
	generate: async (event) => {
		const user = event.locals.user;
		if (!user || !user.roles.some((r) => r === 'owner' || r === 'admin')) {
			return fail(403, { message: 'Forbidden' });
		}

		const form = await event.request.formData();
		const selectedRoles = form
			.getAll('role')
			.filter((v): v is string => typeof v === 'string') as AuthRole[];
		const label = (form.get('label') as string)?.trim() || null;
		const expiresInDays = parseInt((form.get('expiresInDays') as string) || '7', 10);
		const linkedPersonId = (form.get('linkedPersonId') as string)?.trim() || null;

		if (selectedRoles.length === 0) return fail(400, { message: 'Select at least one role' });

		const invalid = selectedRoles.filter((r) => !authRoles.includes(r as AuthRole));
		if (invalid.length > 0) return fail(400, { message: `Invalid roles: ${invalid.join(', ')}` });

		const isEmployeeInvite = selectedRoles.includes('employee');
		if (isEmployeeInvite && !linkedPersonId) {
			return fail(400, { message: 'Select an employee to link for an employee invite code.' });
		}

		const ctx = await createModuleContext(event);
		const repo = new InviteCodeRepository(ctx.db);
		const audit = new AuditRepository(ctx.db);

		// Re-validate the chosen person server-side — never trust the form. It must
		// be an active employee_profile that is not already bound to an account.
		if (linkedPersonId) {
			const [linkable, linkedIds] = await Promise.all([
				createEmployeeApi(ctx).listLinkableEmployees(),
				new UserPersonLinkRepository(ctx.db).listActiveLinkedPersonIds()
			]);
			const linkedSet = new Set(linkedIds);
			const available =
				linkable.some((p) => p.id === linkedPersonId) && !linkedSet.has(linkedPersonId);
			if (!available) {
				return fail(400, { message: 'Selected employee is not available for linking.' });
			}
		}

		const now = new Date();
		const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
		const code = generateCode();
		const id = crypto.randomUUID();

		await repo.create({
			id,
			code,
			roles: JSON.stringify(selectedRoles),
			linkedPersonId,
			createdBy: user.id,
			expiresAt: expiresAt.toISOString(),
			// A person-bound invite is single-use: a person maps to one account.
			maxUses: 1,
			useCount: 0,
			label
		});

		await audit.writeLog(user, {
			action: 'invite_code.created',
			entityType: 'invite_code',
			entityId: id,
			module: 'core',
			actionType: 'create',
			ipAddress: event.getClientAddress(),
			metadata: { roles: selectedRoles, expiresAt: expiresAt.toISOString(), label, linkedPersonId }
		});

		return { saved: true, message: `Invite code generated: ${code}`, generatedCode: code };
	},

	revoke: async (event) => {
		const user = event.locals.user;
		if (!user || !user.roles.some((r) => r === 'owner' || r === 'admin')) {
			return fail(403, { message: 'Forbidden' });
		}

		const form = await event.request.formData();
		const codeId = form.get('codeId') as string;
		if (!codeId) return fail(400, { message: 'Code ID required' });

		const ctx = await createModuleContext(event);
		const repo = new InviteCodeRepository(ctx.db);
		await repo.softDelete(codeId);

		const audit = new AuditRepository(ctx.db);
		await audit.writeLog(user, {
			action: 'invite_code.revoked',
			entityType: 'invite_code',
			entityId: codeId,
			module: 'core',
			actionType: 'delete',
			ipAddress: event.getClientAddress()
		});

		return { saved: true, message: 'Invite code revoked.' };
	}
};
