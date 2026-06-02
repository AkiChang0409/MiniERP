import type { PageServerLoad } from './$types';

import { createModuleContext } from '$platform/modules';
import { createProjectApi } from '$modules/project';

function firstOfMonth(date: Date): Date {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function lastOfMonth(date: Date): Date {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function parseMonthParam(value: string | null): { year: number; month: number } {
	if (value) {
		const m = /^(\d{4})-(\d{2})$/.exec(value);
		if (m) {
			const year = Number(m[1]);
			const month = Number(m[2]) - 1;
			if (Number.isFinite(year) && month >= 0 && month <= 11) {
				return { year, month };
			}
		}
	}
	const now = new Date();
	return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
}

export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		return {
			entries: [],
			month: { year: new Date().getUTCFullYear(), month: new Date().getUTCMonth() },
			range: { from: '', to: '' }
		};
	}

	const { year, month } = parseMonthParam(event.url.searchParams.get('month'));
	const first = firstOfMonth(new Date(Date.UTC(year, month, 1)));
	const last = lastOfMonth(new Date(Date.UTC(year, month, 1)));
	const fromIso = first.toISOString().slice(0, 10);
	const toIso = last.toISOString().slice(0, 10);

	const ctx = await createModuleContext(event);
	const project = createProjectApi(ctx);
	const entries = await project.getCalendarEntries({ fromIso, toIso });

	return {
		entries,
		month: { year, month },
		range: { from: fromIso, to: toIso }
	};
};
