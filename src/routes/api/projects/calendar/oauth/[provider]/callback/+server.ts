import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { ProjectCalendarIntegrationService } from '$modules/project';
import { fail } from '$platform/http';

/**
 * GET /api/projects/calendar/oauth/<provider>/callback?code=…
 *
 * Provider redirects here after consent. Exchange the code, persist tokens,
 * then bounce back to /projects/calendar where the user came from.
 */
export const GET: RequestHandler = async (event) => {
	const provider = event.params.provider as 'google' | 'outlook';
	if (provider !== 'google' && provider !== 'outlook') {
		return fail('Unknown provider.', 400);
	}
	const code = event.url.searchParams.get('code');
	if (!code) return fail('Missing authorization code.', 400);

	const ctx = await createModuleContext(event);
	const svc = new ProjectCalendarIntegrationService(ctx);
	const origin = event.url.origin;
	const redirectUri = `${origin}/api/projects/calendar/oauth/${provider}/callback`;
	const result = await svc.handleCallback(provider, code, redirectUri);
	if (!result.ok) {
		return fail(result.message ?? 'OAuth exchange failed.', 502);
	}
	throw redirect(303, `/projects/calendar?connected=${provider}`);
};
