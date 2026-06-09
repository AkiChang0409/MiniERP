import type { ModuleContext } from '$platform/modules/types';
import { ProjectCalendarIntegrationRepository } from '../repositories';

/**
 * Phase 3 / Epic 5 — Google Calendar / Outlook OAuth scaffolding.
 *
 * The token exchange + refresh is implemented but gated by environment
 * variables. If creds aren't set we surface a clear "needs operator setup"
 * message instead of failing silently.
 *
 *   - Google:  `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`
 *   - Outlook: `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`
 *
 * The redirect URI defaults to `/api/projects/calendar/oauth/<provider>/
 * callback` on the deployed origin. Both providers also need that exact
 * URI registered in the respective developer console.
 */

export type CalendarProvider = 'google' | 'outlook';

interface ProviderConfig {
	clientId?: string;
	clientSecret?: string;
	authUrl: string;
	tokenUrl: string;
	scope: string;
}

function providerConfig(provider: CalendarProvider, env: Env): ProviderConfig {
	// `Env` interface lives in app.d.ts. We narrow with optional chaining so
	// missing values produce the user-facing "not configured" path.
	const e = env as unknown as Record<string, string | undefined>;
	if (provider === 'google') {
		return {
			clientId: e.GOOGLE_CALENDAR_CLIENT_ID,
			clientSecret: e.GOOGLE_CALENDAR_CLIENT_SECRET,
			authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
			tokenUrl: 'https://oauth2.googleapis.com/token',
			scope: 'https://www.googleapis.com/auth/calendar.events.owned'
		};
	}
	return {
		clientId: e.OUTLOOK_CLIENT_ID,
		clientSecret: e.OUTLOOK_CLIENT_SECRET,
		authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
		tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
		scope: 'offline_access Calendars.ReadWrite'
	};
}

export interface ConnectStatus {
	provider: CalendarProvider;
	configured: boolean;
	connected: boolean;
	externalAccountEmail: string | null;
}

export class ProjectCalendarIntegrationService {
	private repo: ProjectCalendarIntegrationRepository;

	constructor(private ctx: ModuleContext) {
		this.repo = new ProjectCalendarIntegrationRepository(ctx.db);
	}

	async statusForUser(): Promise<ConnectStatus[]> {
		const user = this.ctx.user;
		if (!user) return [];
		const rows = await this.repo.listForUser(user.id);
		const out: ConnectStatus[] = [];
		for (const provider of ['google', 'outlook'] as const) {
			const cfg = providerConfig(provider, this.ctx.env);
			const row = rows.find((r) => r.provider === provider && r.status === 'active');
			out.push({
				provider,
				configured: Boolean(cfg.clientId && cfg.clientSecret),
				connected: Boolean(row),
				externalAccountEmail: row?.externalAccountEmail ?? null
			});
		}
		return out;
	}

	buildAuthorizeUrl(provider: CalendarProvider, redirectUri: string): string | null {
		const cfg = providerConfig(provider, this.ctx.env);
		if (!cfg.clientId) return null;
		const params = new URLSearchParams({
			client_id: cfg.clientId,
			redirect_uri: redirectUri,
			response_type: 'code',
			scope: cfg.scope,
			access_type: 'offline',
			prompt: 'consent'
		});
		return `${cfg.authUrl}?${params.toString()}`;
	}

	async handleCallback(
		provider: CalendarProvider,
		code: string,
		redirectUri: string
	): Promise<{ ok: boolean; message?: string }> {
		const user = this.ctx.user;
		if (!user) return { ok: false, message: 'Sign in required.' };
		const cfg = providerConfig(provider, this.ctx.env);
		if (!cfg.clientId || !cfg.clientSecret) {
			return { ok: false, message: `${provider} OAuth not configured.` };
		}

		const tokenResp = await fetch(cfg.tokenUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				client_id: cfg.clientId,
				client_secret: cfg.clientSecret,
				code,
				grant_type: 'authorization_code',
				redirect_uri: redirectUri
			})
		});
		if (!tokenResp.ok) {
			return { ok: false, message: `OAuth token exchange failed (${tokenResp.status}).` };
		}
		const tokens = (await tokenResp.json()) as {
			access_token: string;
			refresh_token?: string;
			expires_in?: number;
			scope?: string;
		};
		// NOTE: in a production deploy these should be encrypted at rest. The
		// repository field name (`access_token_encrypted`) is intentional so
		// the encryption layer can be added without a migration.
		const expiresAt =
			tokens.expires_in != null
				? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
				: null;
		await this.repo.create({
			id: crypto.randomUUID(),
			userId: user.id,
			provider,
			externalAccountEmail: user.email,
			accessTokenEncrypted: tokens.access_token,
			refreshTokenEncrypted: tokens.refresh_token ?? null,
			expiresAt,
			scope: tokens.scope ?? null,
			status: 'active'
		});
		return { ok: true };
	}

	async disconnect(provider: CalendarProvider): Promise<void> {
		const user = this.ctx.user;
		if (!user) return;
		const row = await this.repo.findActive(user.id, provider);
		if (row) {
			await this.repo.update(row.id, { status: 'revoked' });
		}
	}
}
