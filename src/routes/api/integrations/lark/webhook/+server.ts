import { json, type RequestHandler } from '@sveltejs/kit';
import { fail } from '$platform/http';

/**
 * Lark (Feishu) event webhook — Phase: handshake + auth skeleton ONLY.
 *
 * Responsibilities (deliberately minimal):
 *   1. URL verification handshake — verify the verification token and echo the
 *      `challenge` (this is what the Lark console calls when you save the URL).
 *   2. Event callbacks — verify the verification token, then acknowledge with
 *      200. NO business logic, NO HR capability dispatch yet — that lands in a
 *      later phase (resolve external identity → classifyHrIntent → guarded
 *      capability execution).
 *
 * Auth model: Lark calls this endpoint with no user session, so `hooks.server.ts`
 * whitelists it from the app's API auth gate. Authentication here is the
 * per-request verification token compared against `LARK_VERIFICATION_TOKEN`
 * (from `.dev.vars` locally / a Wrangler secret in prod).
 *
 * Encryption: if an Encrypt Key is enabled in the Lark console, callbacks arrive
 * as `{ "encrypt": "<base64>" }` and requests are signed. We intentionally do
 * NOT configure `LARK_ENCRYPT_KEY` yet, so encrypted payloads are rejected with
 * a clear 501 and the signature check is left as a documented skeleton below.
 */

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

/** Length-safe constant-time string compare (avoids token-length/timing leaks). */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let mismatch = 0;
	for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return mismatch === 0;
}

export const POST: RequestHandler = async (event) => {
	const expectedToken = event.platform?.env?.LARK_VERIFICATION_TOKEN;
	if (!expectedToken) {
		// Server misconfiguration — surface it rather than silently 200.
		// (Run `npm run dev:cf` so `.dev.vars` is injected into the Worker env.)
		return fail('LARK_VERIFICATION_TOKEN is not configured on the server', 500);
	}

	const rawBody = await event.request.text();
	let body: Record<string, unknown>;
	try {
		body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
	} catch {
		return fail('Invalid JSON body', 400);
	}

	// --- Encrypted mode (LARK_ENCRYPT_KEY) — not supported yet ---
	if ('encrypt' in body) {
		return fail(
			'Encrypted Lark callbacks are not supported yet. Leave the Encrypt Key unset in the Lark console, or implement AES-256-CBC decrypt + set LARK_ENCRYPT_KEY.',
			501
		);
	}

	// --- Signature verification skeleton (only relevant once Encrypt Key is on) ---
	// When an Encrypt Key is configured, Lark signs each request:
	//   X-Lark-Signature = sha256(timestamp + nonce + encryptKey + rawBody)
	// With no Encrypt Key, Lark does not sign requests, so we authenticate via the
	// verification token below. Hook left here intentionally for the encrypted phase:
	//   const timestamp = event.request.headers.get('X-Lark-Request-Timestamp');
	//   const nonce = event.request.headers.get('X-Lark-Request-Nonce');
	//   const signature = event.request.headers.get('X-Lark-Signature');

	// --- 1) URL verification handshake ---
	if (asString(body.type) === 'url_verification') {
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

	// --- 2) Event callback — verify token, then acknowledge only ---
	// schema 2.0 → header.token; legacy v1 → top-level token.
	const header = body.header as Record<string, unknown> | undefined;
	const token = asString(header?.token) ?? asString(body.token);
	if (!token || !timingSafeEqual(token, expectedToken)) {
		return fail('Invalid verification token', 401);
	}

	const eventType =
		asString(header?.event_type) ??
		asString((body.event as Record<string, unknown> | undefined)?.type) ??
		'unknown';
	// Acknowledge fast (Lark retries unless it sees a 2xx). Processing is a later phase.
	console.log(`[lark] event received and acknowledged (not processed): ${eventType}`);
	return json({ ok: true });
};
