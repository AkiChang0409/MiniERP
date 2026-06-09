import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { ProjectTaskService } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * Portfolio Gantt feed.
 *
 *   GET /api/projects/gantt?scope=mine|all&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns one row per project — id, name, start, deadline, status, owner,
 * task totals, and a 0-100 completion percentage. The UI overlays the
 * computed urgency color on top.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const svc = new ProjectTaskService(ctx);
		const scope = event.url.searchParams.get('scope') === 'mine' ? 'mine' : 'all';
		const data = await svc.portfolio({
			scope,
			fromIso: event.url.searchParams.get('from') ?? undefined,
			toIso: event.url.searchParams.get('to') ?? undefined
		});
		return ok(data);
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
