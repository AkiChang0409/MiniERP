import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { ProjectCalendarIntegrationService } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * POST /api/projects/calendar/oauth/<provider>/disconnect
 *
 * Marks the row as `revoked`. We intentionally don't try to revoke at the
 * provider — that takes another roundtrip and is a no-op if the user
 * already removed our app from their account.
 */
export const POST: RequestHandler = async (event) => {
	const provider = event.params.provider as 'google' | 'outlook';
	if (provider !== 'google' && provider !== 'outlook') {
		return fail('Unknown provider.', 400);
	}
	try {
		const ctx = await createModuleContext(event);
		const svc = new ProjectCalendarIntegrationService(ctx);
		await svc.disconnect(provider);
		return ok({ disconnected: true });
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
