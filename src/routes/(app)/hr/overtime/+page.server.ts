import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createModuleContext } from '$platform/modules';
import { createOvertimeApi, OvertimeValidationError } from '$modules/hr';

function currentMonthStart(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function currentMonthEnd(): string {
	const d = new Date();
	const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
	return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		return {
			tab: 'candidates',
			filters: { dateFrom: currentMonthStart(), dateTo: currentMonthEnd(), status: '' },
			candidates: [],
			requests: []
		};
	}

	const tab = event.url.searchParams.get('tab') ?? 'candidates';
	const dateFrom = event.url.searchParams.get('dateFrom') ?? currentMonthStart();
	const dateTo = event.url.searchParams.get('dateTo') ?? currentMonthEnd();
	const status = event.url.searchParams.get('status') ?? '';

	const ctx = await createModuleContext(event);
	const overtime = createOvertimeApi(ctx);

	const candidates =
		tab !== 'requests' ? await overtime.listCandidates({ dateFrom, dateTo }) : [];
	const requests =
		tab === 'requests' ? await overtime.listRequests({ status: status || undefined }) : [];

	return {
		tab,
		filters: { dateFrom, dateTo, status },
		candidates,
		requests
	};
};

export const actions: Actions = {
	generate: async (event) => {
		if (!event.platform) return fail(500, { message: 'Platform unavailable' });

		const form = await event.request.formData();
		const attendanceRecordId = String(form.get('attendanceRecordId') ?? '').trim();
		const reason = String(form.get('reason') ?? '').trim() || undefined;

		if (!attendanceRecordId) return fail(400, { message: 'Missing attendance record ID' });

		try {
			const ctx = await createModuleContext(event);
			const overtime = createOvertimeApi(ctx);
			await overtime.generateRequest(attendanceRecordId, reason);
			return { ok: true, action: 'generated' as const };
		} catch (err) {
			if (err instanceof OvertimeValidationError) {
				return fail(400, { message: err.message });
			}
			throw err;
		}
	},

	approve: async (event) => {
		if (!event.platform) return fail(500, { message: 'Platform unavailable' });

		const form = await event.request.formData();
		const overtimeRequestId = String(form.get('overtimeRequestId') ?? '').trim();
		const comment = String(form.get('comment') ?? '').trim() || undefined;

		if (!overtimeRequestId) return fail(400, { message: 'Missing overtime request ID' });

		try {
			const ctx = await createModuleContext(event);
			const overtime = createOvertimeApi(ctx);
			await overtime.approveRequest(overtimeRequestId, comment);
			return { ok: true, action: 'approved' as const };
		} catch (err) {
			if (err instanceof OvertimeValidationError) {
				return fail(400, { message: err.message });
			}
			throw err;
		}
	},

	reject: async (event) => {
		if (!event.platform) return fail(500, { message: 'Platform unavailable' });

		const form = await event.request.formData();
		const overtimeRequestId = String(form.get('overtimeRequestId') ?? '').trim();
		const rejectionReason = String(form.get('rejectionReason') ?? '').trim();

		if (!overtimeRequestId) return fail(400, { message: 'Missing overtime request ID' });
		if (!rejectionReason) return fail(400, { message: 'Rejection reason is required' });

		try {
			const ctx = await createModuleContext(event);
			const overtime = createOvertimeApi(ctx);
			await overtime.rejectRequest(overtimeRequestId, rejectionReason);
			return { ok: true, action: 'rejected' as const };
		} catch (err) {
			if (err instanceof OvertimeValidationError) {
				return fail(400, { message: err.message });
			}
			throw err;
		}
	}
};
