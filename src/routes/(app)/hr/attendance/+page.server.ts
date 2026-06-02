import type { PageServerLoad } from './$types';
import { createModuleContext } from '$platform/modules';
import { createAttendanceApi } from '$modules/hr';

function currentMonthStart(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function currentMonthEnd(): string {
	const d = new Date();
	const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
	return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
	const d = new Date(dateStr + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		return {
			view: 'summary' as const,
			weeklySummary: [],
			records: [],
			employeeName: null,
			personId: '',
			weekStart: '',
			weekEnd: '',
			filters: {
				dateFrom: currentMonthStart(),
				dateTo: currentMonthEnd(),
				status: '',
				source: ''
			}
		};
	}

	const view = (event.url.searchParams.get('view') ?? 'summary') as 'summary' | 'detail';
	const personId = event.url.searchParams.get('personId') ?? '';
	const weekStart = event.url.searchParams.get('weekStart') ?? '';
	const weekEnd = event.url.searchParams.get('weekEnd') || (weekStart ? addDays(weekStart, 6) : '');
	const dateFrom = event.url.searchParams.get('dateFrom') ?? currentMonthStart();
	const dateTo = event.url.searchParams.get('dateTo') ?? currentMonthEnd();
	const status = event.url.searchParams.get('status') ?? '';
	const source = event.url.searchParams.get('source') ?? '';

	const ctx = await createModuleContext(event);
	const attendance = createAttendanceApi(ctx);

	if (view === 'detail' && personId && weekStart) {
		const [records, employeeName] = await Promise.all([
			attendance.listRecords({
				personId,
				weekStart,
				weekEnd
			}),
			attendance.getPersonName(personId)
		]);

		return {
			view: 'detail' as const,
			records,
			employeeName,
			personId,
			weekStart,
			weekEnd,
			weeklySummary: [],
			filters: { dateFrom, dateTo, status, source }
		};
	}

	const weeklySummary = await attendance.listWeeklySummary({
		dateFrom,
		dateTo,
		status: status || undefined,
		source: source || undefined
	});

	return {
		view: 'summary' as const,
		weeklySummary,
		records: [],
		employeeName: null,
		personId: '',
		weekStart: '',
		weekEnd: '',
		filters: { dateFrom, dateTo, status, source }
	};
};
