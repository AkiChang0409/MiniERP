import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { createProjectApi, summarizeDashboard } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * GET /api/projects/dashboard/summary
 *
 * Server-side: pull the live dashboard numbers, ask the LLM for an exec
 * summary, return both. Client-side dashboard renders it as a banner.
 */
export const GET: RequestHandler = async (event) => {
	if (!event.platform) {
		return fail('Cloudflare platform bindings are required', 500);
	}
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const dashboard = await project.getDashboard();
		const today = new Date();
		const todayMs = today.getTime();
		const result = await summarizeDashboard(
			{
				statusSummary: dashboard.statusSummary,
				upcoming: dashboard.upcoming.map((u) => ({
					name: u.name,
					deadline: u.deadline ?? null,
					status: u.status
				})),
				overdue: dashboard.overdue.map((o) => ({
					name: o.name,
					deadline: o.deadline ?? null,
					daysOverdue: o.deadline
						? Math.max(0, Math.round((todayMs - Date.parse(o.deadline)) / 86_400_000))
						: 0
				}))
			},
			event.platform.env
		);
		return ok({
			generatedAt: new Date().toISOString(),
			summary: result.summary,
			status: result.status
		});
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
