import type { PageServerLoad } from './$types';

import { createModuleContext } from '$platform/modules';
import {
	createProjectApi,
	ProjectCalendarIntegrationService
} from '$modules/project';

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
			range: { from: '', to: '' },
			integrations: []
		};
	}

	const { year, month } = parseMonthParam(event.url.searchParams.get('month'));
	const first = firstOfMonth(new Date(Date.UTC(year, month, 1)));
	const last = lastOfMonth(new Date(Date.UTC(year, month, 1)));
	const fromIso = first.toISOString().slice(0, 10);
	const toIso = last.toISOString().slice(0, 10);

	const ctx = await createModuleContext(event);
	const project = createProjectApi(ctx);
	const integrationsSvc = new ProjectCalendarIntegrationService(ctx);

	// `statusForUser()` already handles a missing table; we still wrap each
	// call so an unrelated DB blip on either side doesn't take the whole
	// page down.
	let entries: Awaited<ReturnType<typeof project.getCalendarEntries>> = [];
	let integrations: Awaited<ReturnType<typeof integrationsSvc.statusForUser>> = [];
	let dataMessage: string | null = null;
	const [entriesRes, integrationsRes] = await Promise.allSettled([
		project.getCalendarEntries({ fromIso, toIso }),
		integrationsSvc.statusForUser()
	]);
	if (entriesRes.status === 'fulfilled') {
		entries = entriesRes.value;
	} else {
		const msg = (entriesRes.reason as Error)?.message ?? '';
		if (/no such table|project_calendar_integrations|project_tasks/i.test(msg)) {
			dataMessage = 'Database is missing recent tables. Run `npm run db:migrate:local`.';
		} else {
			throw entriesRes.reason;
		}
	}
	if (integrationsRes.status === 'fulfilled') {
		integrations = integrationsRes.value;
	}

	return {
		entries,
		month: { year, month },
		range: { from: fromIso, to: toIso },
		integrations,
		dataMessage
	};
};
