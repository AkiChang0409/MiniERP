import type { RequestHandler } from './$types';

import { fail, ok } from '$platform/http';
import { createModuleContext } from '$platform/modules';
import { createFinanceApi } from '$modules/finance';

/**
 * GET /api/finance/today-brief
 *
 * Returns a real-time list of today's brief items for the AI Panel dashboard,
 * derived from live DB state rather than mock data.
 *
 * Signals aggregated:
 *  - `ready_for_review` document artifacts (primary action driver)
 *  - In-flight documents still being processed (informational)
 *  - Upcoming / overdue Singapore GST quarterly filing deadline (14-day window)
 *
 * Response shape matches `BriefItem[]` from `src/app/ai-panel/workflow/types.ts`
 * so the frontend can use it directly.
 */
export const GET: RequestHandler = async (event) => {
	if (!event.platform) return fail('Cloudflare platform bindings are required', 500);
	const user = event.locals.user;
	if (!user) return fail('Unauthorized', 401);

	const ctx = await createModuleContext(event);
	const { insights } = createFinanceApi(ctx);
	const data = await insights.getTodayBrief();

	return ok(data);
};
