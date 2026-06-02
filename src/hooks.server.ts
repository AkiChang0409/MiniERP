import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';

import { getAuth } from '$platform/auth/better-auth';
import { resolveWorkerAuthEnv } from '$platform/auth/resolve-worker-env';
import { parseRoles } from '$platform/auth/config';
import { defaultPathForRoles, isRouteAllowed } from '$platform/auth/permissions';
import { getDb } from './infrastructure/db';
import {
	getEnabledModuleIds,
	isPathAllowedForRole,
	isPathEnabled
} from '$app-layer/bootstrap/module-access';

// Register all modules at app startup (side-effect import)
import '$app-layer/bootstrap/register-modules';
// Register AI capabilities into the platform capability registry (side-effect import)
import '$app-layer/bootstrap/register-ai-capabilities';

function isPublicAppPath(pathname: string) {
	return (
		pathname === '/login' ||
		pathname === '/register' ||
		pathname.startsWith('/reset-password') ||
		pathname === '/forgot-password'
	);
}

function needsAppAuth(pathname: string) {
	if (isPublicAppPath(pathname)) return false;
	return (
		pathname.startsWith('/finance/dashboard') ||
		pathname.startsWith('/finance/expenses') ||
		pathname.startsWith('/ar') ||
		pathname.startsWith('/finance') ||
		pathname.startsWith('/projects') ||
		pathname.startsWith('/procurement') ||
		pathname.startsWith('/sales-crm') ||
		pathname.startsWith('/hr/employees') ||
		pathname.startsWith('/finance/tax') ||
		pathname.startsWith('/finance/reports') ||
		pathname.startsWith('/settings')
	);
}

function needsApiAuth(pathname: string) {
	return pathname.startsWith('/api/');
}

function isPublicAuthApi(pathname: string) {
	return pathname.startsWith('/api/auth');
}

export const handle: Handle = async ({ event, resolve }) => {
	if (building) {
		return resolve(event);
	}

	const env = resolveWorkerAuthEnv(event);
	if (!env) {
		console.error(
			'[auth] Missing BETTER_AUTH_SECRET (and Cloudflare bindings). For local dev: create `.dev.vars` with BETTER_AUTH_SECRET (see `.dev.vars.example`) and run `npm run dev:cf`.'
		);
		event.locals.user = null;
		return resolve(event);
	}

	const auth = getAuth(env);
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session?.user) {
		const u = session.user as { id: string; email: string; role?: string };
		event.locals.user = {
			id: u.id,
			email: u.email,
			roles: parseRoles(u.role)
		};
	} else {
		event.locals.user = null;
	}

	if (
		(event.url.pathname === '/login' || event.url.pathname === '/register') &&
		event.locals.user
	) {
		throw redirect(303, defaultPathForRoles(event.locals.user.roles));
	}

	const path = event.url.pathname;
	const wantApiAuth = needsApiAuth(path);
	const wantAppAuth = needsAppAuth(path);

	if (wantAppAuth || (wantApiAuth && !isPublicAuthApi(path))) {
		if (!event.locals.user) {
			if (wantApiAuth) {
				return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 });
			}
			throw redirect(303, '/login');
		}

		if (
			!isRouteAllowed(path, event.locals.user.roles) ||
			!isPathAllowedForRole(path, event.locals.user.roles, event.request.method)
		) {
			if (wantApiAuth) {
				return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), { status: 403 });
			}
			const fallback = defaultPathForRoles(event.locals.user.roles);
			if (fallback === path) {
				return new Response('Forbidden', { status: 403 });
			}
			throw redirect(303, fallback);
		}

		if (event.platform) {
			const db = getDb(env);
			const enabledIds = await getEnabledModuleIds(db);
			if (!isPathEnabled(path, enabledIds)) {
				return new Response('Not Found', { status: 404 });
			}
		}
	}

	if (path === '/api/auth/register') {
		return resolve(event);
	}

	return svelteKitHandler({ event, resolve, auth, building });
};
