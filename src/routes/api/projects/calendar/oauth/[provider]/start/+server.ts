import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { ProjectCalendarIntegrationService } from '$modules/project';
import { fail } from '$platform/http';

/**
 * GET /api/projects/calendar/oauth/google/start
 * GET /api/projects/calendar/oauth/outlook/start
 *
 * Redirects the browser to the provider's consent screen. Provider creds
 * are pulled from `event.platform.env`; if missing we return a clean 503
 * instead of an opaque OAuth failure.
 */
export const GET: RequestHandler = async (event) => {
	const provider = event.params.provider as 'google' | 'outlook';
	if (provider !== 'google' && provider !== 'outlook') {
		return fail('Unknown provider.', 400);
	}
	const ctx = await createModuleContext(event);
	const svc = new ProjectCalendarIntegrationService(ctx);
	const origin = event.url.origin;
	const redirectUri = `${origin}/api/projects/calendar/oauth/${provider}/callback`;
	const url = svc.buildAuthorizeUrl(provider, redirectUri);
	if (!url) {
		return fail(
			`${provider} OAuth is not configured. Set ${
				provider === 'google'
					? 'GOOGLE_CALENDAR_CLIENT_ID + GOOGLE_CALENDAR_CLIENT_SECRET'
					: 'OUTLOOK_CLIENT_ID + OUTLOOK_CLIENT_SECRET'
			} in the env.`,
			503
		);
	}
	throw redirect(303, url);
};
