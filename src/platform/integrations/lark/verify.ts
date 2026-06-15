/**
 * Shared Lark (Feishu) inbound-verification primitives.
 *
 * Both inbound endpoints — the event webhook (`/api/integrations/lark/webhook`)
 * and the interactive-card callback (`/api/integrations/lark/card-callback`) —
 * share the same verification token, url_verification handshake, and encrypted-
 * mode policy. Centralising them here keeps the two endpoints from drifting
 * apart (e.g. one accidentally skipping the token check).
 */
import { json } from '@sveltejs/kit';
import { fail } from '$platform/http';

export function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

/** Length-safe constant-time string compare (avoids token-length/timing leaks). */
export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let mismatch = 0;
	for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return mismatch === 0;
}

/**
 * Resolve the configured verification token, or a 500 Response describing the
 * misconfiguration. Both inbound endpoints fail closed when it is unset, rather
 * than silently 200-ing and letting unverified callbacks through.
 */
export function resolveVerificationToken(
	env: Env | undefined
): { token: string } | { response: Response } {
	const token = env?.LARK_VERIFICATION_TOKEN;
	if (!token) {
		// (Run `npm run dev:cf` so `.dev.vars` is injected into the Worker env.)
		return { response: fail('LARK_VERIFICATION_TOKEN is not configured on the server', 500) };
	}
	return { token };
}

/**
 * Reject AES-encrypted callbacks (the LARK_ENCRYPT_KEY mode) — not supported
 * yet. Returns a 501 Response when the body is encrypted, otherwise null.
 */
export function rejectEncryptedCallback(body: Record<string, unknown>): Response | null {
	if ('encrypt' in body) {
		return fail(
			'Encrypted Lark callbacks are not supported yet. Leave the Encrypt Key unset in the Lark console, or implement AES-256-CBC decrypt + set LARK_ENCRYPT_KEY.',
			501
		);
	}
	return null;
}

/**
 * Handle the url_verification handshake shared by the event + card-callback
 * configs. Returns the `{ challenge }` Response when the body is a (token-valid)
 * handshake, a 401/400 Response on bad token / missing challenge, or null when
 * the body is a normal callback the caller should keep processing.
 */
export function handleUrlVerification(
	body: Record<string, unknown>,
	expectedToken: string
): Response | null {
	if (asString(body.type) !== 'url_verification') return null;
	const token = asString(body.token);
	if (!token || !timingSafeEqual(token, expectedToken)) {
		return fail('Invalid verification token', 401);
	}
	const challenge = asString(body.challenge);
	if (!challenge) {
		return fail('Missing challenge', 400);
	}
	// Lark expects exactly { "challenge": "<value>" } — not the app's ok() envelope.
	return json({ challenge });
}

/**
 * Verify the token on a real (non-handshake) callback. Schema 2.0 events →
 * `header.token`; legacy v1 events and interactive-card callbacks → top-level
 * `token`. Checks both so one helper covers every inbound shape.
 */
export function verifyCallbackToken(body: Record<string, unknown>, expectedToken: string): boolean {
	const header = body.header as Record<string, unknown> | undefined;
	const token = asString(header?.token) ?? asString(body.token);
	return !!token && timingSafeEqual(token, expectedToken);
}
