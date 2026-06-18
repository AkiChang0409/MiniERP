import type { PageServerLoad } from './$types';

import { createModuleContext } from '$platform/modules';
import { createProjectApi, ProjectCalendarIntegrationService } from '$modules/project';

type CalendarView = 'agenda' | 'week' | 'month';

function parseView(value: string | null): CalendarView {
	return value === 'agenda' || value === 'month' ? value : 'week';
}

function isoDay(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function parseAnchor(value: string | null): Date {
	if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
		const d = new Date(`${value}T00:00:00Z`);
		if (!Number.isNaN(d.getTime())) return d;
	}
	return new Date(`${isoDay(new Date())}T00:00:00Z`);
}

function parseMonth(value: string | null): { year: number; month: number } {
	if (value) {
		const m = /^(\d{4})-(\d{2})$/.exec(value);
		if (m) {
			const year = Number(m[1]);
			const month = Number(m[2]) - 1;
			if (Number.isFinite(year) && month >= 0 && month <= 11) return { year, month };
		}
	}
	const now = new Date();
	return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
}

/** Window the calendar projects events over, derived from the active view. */
function windowFor(
	view: CalendarView,
	anchor: Date,
	month: { year: number; month: number }
): { fromIso: string; toIso: string } {
	if (view === 'month') {
		const first = new Date(Date.UTC(month.year, month.month, 1));
		const last = new Date(Date.UTC(month.year, month.month + 1, 0));
		return { fromIso: isoDay(first), toIso: isoDay(last) };
	}
	if (view === 'week') {
		const start = new Date(anchor);
		start.setUTCDate(start.getUTCDate() - start.getUTCDay()); // back to Sunday
		const end = new Date(start);
		end.setUTCDate(end.getUTCDate() + 6);
		return { fromIso: isoDay(start), toIso: isoDay(end) };
	}
	// agenda: reach back to surface overdue work + look ~3 weeks ahead.
	const start = new Date(anchor);
	start.setUTCDate(start.getUTCDate() - 45);
	const end = new Date(anchor);
	end.setUTCDate(end.getUTCDate() + 21);
	return { fromIso: isoDay(start), toIso: isoDay(end) };
}

export const load: PageServerLoad = async (event) => {
	const view = parseView(event.url.searchParams.get('view'));
	const anchor = parseAnchor(event.url.searchParams.get('date'));
	const month = parseMonth(event.url.searchParams.get('month'));

	const currentUserId = event.locals.user?.id ?? null;

	if (!event.platform) {
		return {
			events: [],
			view,
			anchor: isoDay(anchor),
			month,
			range: { from: '', to: '' },
			integrations: [],
			currentUserId,
			dataMessage: 'Cloudflare platform bindings are required.'
		};
	}

	const { fromIso, toIso } = windowFor(view, anchor, month);

	const ctx = await createModuleContext(event);
	const project = createProjectApi(ctx);
	const integrationsSvc = new ProjectCalendarIntegrationService(ctx);

	let events: Awaited<ReturnType<typeof project.getCalendarEvents>> = [];
	let integrations: Awaited<ReturnType<typeof integrationsSvc.statusForUser>> = [];
	let dataMessage: string | null = null;

	const [eventsRes, integrationsRes] = await Promise.allSettled([
		project.getCalendarEvents({ fromIso, toIso }),
		integrationsSvc.statusForUser()
	]);

	if (eventsRes.status === 'fulfilled') {
		events = eventsRes.value;
	} else {
		const msg = (eventsRes.reason as Error)?.message ?? '';
		if (/no such table|project_tasks|project_calendar_integrations/i.test(msg)) {
			dataMessage = 'Database is missing recent tables. Run `npm run db:migrate:local`.';
		} else {
			throw eventsRes.reason;
		}
	}
	if (integrationsRes.status === 'fulfilled') {
		integrations = integrationsRes.value;
	}

	return {
		events,
		view,
		anchor: isoDay(anchor),
		month,
		range: { from: fromIso, to: toIso },
		integrations,
		currentUserId,
		dataMessage
	};
};
