import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createModuleContext } from '$platform/modules';
import { createLeaveApi, LeaveValidationError } from '$modules/hr';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		return {
			tab: 'requests',
			filters: { status: '', leaveTypeId: '' },
			leaveTypes: [],
			requests: [],
			balances: [],
			year: new Date().getFullYear()
		};
	}

	const tab = event.url.searchParams.get('tab') ?? 'requests';
	const status = event.url.searchParams.get('status') ?? '';
	const leaveTypeId = event.url.searchParams.get('leaveTypeId') ?? '';
	const year = parseInt(event.url.searchParams.get('year') ?? String(new Date().getFullYear()), 10);

	const ctx = await createModuleContext(event);
	const leave = createLeaveApi(ctx);

	const leaveTypes = await leave.listLeaveTypes();

	const requests = tab !== 'balances' ? await leave.listLeaveRequests({ status: status || undefined, leaveTypeId: leaveTypeId || undefined }) : [];
	const balances = tab === 'balances' ? await leave.listLeaveBalances(year) : [];

	return {
		tab,
		filters: { status, leaveTypeId },
		leaveTypes,
		requests,
		balances,
		year
	};
};

export const actions: Actions = {
	approve: async (event) => {
		if (!event.platform) return fail(500, { message: 'Platform unavailable' });

		const form = await event.request.formData();
		const leaveRequestId = String(form.get('leaveRequestId') ?? '').trim();
		const comment = String(form.get('comment') ?? '').trim() || undefined;

		if (!leaveRequestId) return fail(400, { message: 'Missing leave request ID' });

		try {
			const ctx = await createModuleContext(event);
			const leave = createLeaveApi(ctx);
			await leave.approveRequest(leaveRequestId, comment);
			return { ok: true, action: 'approved' as const };
		} catch (err) {
			if (err instanceof LeaveValidationError) {
				return fail(400, { message: err.message });
			}
			throw err;
		}
	},

	reject: async (event) => {
		if (!event.platform) return fail(500, { message: 'Platform unavailable' });

		const form = await event.request.formData();
		const leaveRequestId = String(form.get('leaveRequestId') ?? '').trim();
		const rejectionReason = String(form.get('rejectionReason') ?? '').trim();

		if (!leaveRequestId) return fail(400, { message: 'Missing leave request ID' });
		if (!rejectionReason) return fail(400, { message: 'Rejection reason is required' });

		try {
			const ctx = await createModuleContext(event);
			const leave = createLeaveApi(ctx);
			await leave.rejectRequest(leaveRequestId, rejectionReason);
			return { ok: true, action: 'rejected' as const };
		} catch (err) {
			if (err instanceof LeaveValidationError) {
				return fail(400, { message: err.message });
			}
			throw err;
		}
	}
};
