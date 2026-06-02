import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { createProjectApi } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * TKMGMT8 — calendar feed.
 *
 *  - `GET /api/projects/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` → JSON.
 *  - `GET /api/projects/calendar?format=ics&from=...&to=...`     → iCalendar
 *    (.ics) file. The ICS export is the practical answer to the AC's
 *    "two-way sync with Google/Outlook": consumers can subscribe to this URL
 *    in their external calendar and updates propagate. Full OAuth-backed
 *    two-way push is out of scope for v1 and would belong in a separate
 *    `platform/calendar/` integration layer.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);

		const today = new Date();
		const todayIso = today.toISOString().slice(0, 10);
		const ninetyOut = new Date(today);
		ninetyOut.setDate(ninetyOut.getDate() + 90);
		const ninetyIso = ninetyOut.toISOString().slice(0, 10);

		const fromIso = event.url.searchParams.get('from') ?? todayIso;
		const toIso = event.url.searchParams.get('to') ?? ninetyIso;
		const format = event.url.searchParams.get('format');

		const entries = await project.getCalendarEntries({ fromIso, toIso });

		if (format === 'ics') {
			const ics = renderIcs(entries, { from: fromIso, to: toIso });
			return new Response(ics, {
				headers: {
					'Content-Type': 'text/calendar; charset=utf-8',
					'Content-Disposition': 'attachment; filename="smartfin-projects.ics"'
				}
			});
		}

		return ok({ from: fromIso, to: toIso, entries });
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};

function renderIcs(
	entries: Array<{
		id: string;
		name: string;
		status: string;
		deadline: string | null;
		priority: number;
	}>,
	range: { from: string; to: string }
) {
	const lines: string[] = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//SmartFin//SmartFin Project Management//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		`X-WR-CALNAME:SmartFin Projects (${range.from} → ${range.to})`
	];
	for (const e of entries) {
		if (!e.deadline) continue;
		const dt = e.deadline.replace(/-/g, '');
		lines.push('BEGIN:VEVENT');
		lines.push(`UID:smartfin-project-${e.id}@smartfin`);
		lines.push(`DTSTAMP:${dt}T000000Z`);
		lines.push(`DTSTART;VALUE=DATE:${dt}`);
		lines.push(`SUMMARY:[P${e.priority}] ${escapeIcs(e.name)} (${e.status})`);
		lines.push(`DESCRIPTION:Project ${e.id} — status ${e.status}, priority ${e.priority}`);
		lines.push('END:VEVENT');
	}
	lines.push('END:VCALENDAR');
	// CRLF per RFC 5545.
	return lines.join('\r\n');
}

function escapeIcs(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}
