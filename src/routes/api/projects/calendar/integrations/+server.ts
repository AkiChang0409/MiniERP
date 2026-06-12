import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { ProjectCalendarIntegrationService } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * GET /api/projects/calendar/integrations
 *   → [{ provider, configured, connected, externalAccountEmail }]
 *
 * Lets the UI render the "Connect Google Calendar" / "Connect Outlook"
 * buttons with the right state.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const svc = new ProjectCalendarIntegrationService(ctx);
		const list = await svc.statusForUser();
		return ok({ integrations: list });
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
