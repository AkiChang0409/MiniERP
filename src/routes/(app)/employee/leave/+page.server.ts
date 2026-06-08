import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createModuleContext } from '$platform/modules';
import { createEmployeeLeaveApi, LeaveValidationError } from '$modules/hr';
import { resolveCurrentPersonId } from '$platform/auth/resolve-current-person';

type LinkState = 'unlinked' | 'inactive' | 'ok';

export const load: PageServerLoad = async (event) => {
	const year = new Date().getFullYear();
	// Surface the logged-in email so the unlinked/inactive states make it obvious
	// WHICH account is being used (the #1 source of "not linked" confusion).
	const userEmail = event.locals.user?.email ?? null;
	const empty = {
		linkState: 'unlinked' as LinkState,
		year,
		userEmail,
		leaveTypes: [] as Awaited<ReturnType<ReturnType<typeof createEmployeeLeaveApi>['listLeaveTypes']>>,
		balances: [] as Awaited<ReturnType<ReturnType<typeof createEmployeeLeaveApi>['listMyBalances']>>,
		requests: [] as Awaited<ReturnType<ReturnType<typeof createEmployeeLeaveApi>['listMyRequests']>>
	};

	if (!event.platform) return empty;

	const ctx = await createModuleContext(event);
	const personId = await resolveCurrentPersonId(ctx.db, event.locals.user?.id);
	if (!personId) {
		// No active user_person_links binding — render an explainer, not a 500.
		return empty;
	}

	const api = createEmployeeLeaveApi(ctx, personId);
	const profileStatus = await api.getProfileStatus();
	if (profileStatus !== 'active') {
		return { ...empty, linkState: 'inactive' as LinkState };
	}

	const [leaveTypes, balances, requests] = await Promise.all([
		api.listLeaveTypes(),
		api.listMyBalances(year),
		api.listMyRequests()
	]);

	return { linkState: 'ok' as LinkState, year, userEmail, leaveTypes, balances, requests };
};

export const actions: Actions = {
	submit: async (event) => {
		if (!event.platform) return fail(500, { message: 'Platform unavailable' });

		const ctx = await createModuleContext(event);
		// personId ALWAYS comes from the resolver, never from the form — a forged
		// personId field in the payload is ignored entirely.
		const personId = await resolveCurrentPersonId(ctx.db, event.locals.user?.id);
		if (!personId) {
			return fail(403, { message: 'Your account is not linked to an employee profile.' });
		}

		const api = createEmployeeLeaveApi(ctx, personId);
		if ((await api.getProfileStatus()) !== 'active') {
			return fail(403, { message: 'Your employee profile is not active.' });
		}

		const form = await event.request.formData();
		const leaveTypeId = String(form.get('leaveTypeId') ?? '').trim();
		const startDate = String(form.get('startDate') ?? '').trim();
		const endDate = String(form.get('endDate') ?? '').trim();
		const reason = String(form.get('reason') ?? '').trim() || undefined;

		if (!leaveTypeId) return fail(400, { message: 'Please choose a leave type' });
		if (!startDate || !endDate) return fail(400, { message: 'Start and end dates are required' });

		try {
			const result = await api.submitRequest({ leaveTypeId, startDate, endDate, reason });
			return { ok: true, requestId: result.id, totalDays: result.totalDays };
		} catch (err) {
			if (err instanceof LeaveValidationError) {
				return fail(400, { message: err.message });
			}
			throw err;
		}
	}
};
