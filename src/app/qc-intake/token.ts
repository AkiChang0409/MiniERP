/**
 * QC intake — stateless signed token (replaces a jobs table).
 *
 * The send gateway embeds `{ projectId, supplierId }` into a self-contained
 * HMAC-SHA256 signed token that rides in the supplier upload URL
 * (`/qc/submit/<token>`). On upload we verify the signature and read the ids
 * back out — no server-side state to look up. Tamper-proof: any edit to the
 * payload invalidates the signature.
 *
 * Format: `base64url(JSON payload) . base64url(HMAC-SHA256(secret, payloadB64))`
 * Payload: `{ p: projectId, s: supplierId, e: expiryMs }`.
 *
 * Uses Web Crypto (`crypto.subtle`), available in Cloudflare Workers — same as
 * `src/platform/workflow/payload-hash.ts` / audit hashing.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface QcTokenPayload {
	projectId: string;
	supplierId: string;
}

interface WirePayload {
	p: string;
	s: string;
	e: number;
}

function resolveSecret(env: Env): string {
	const secret = env.QC_TOKEN_SECRET;
	if (!secret) throw new Error('QC_TOKEN_SECRET is not configured');
	return secret;
}

function bytesToB64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlToBytes(b64url: string): Uint8Array {
	const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/** Length-safe constant-time string compare (avoids timing leaks on the sig). */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let mismatch = 0;
	for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return mismatch === 0;
}

async function hmac(secret: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
	return bytesToB64Url(new Uint8Array(sig));
}

/** Sign a `{ projectId, supplierId }` token with an expiry (default 30 days). */
export async function signQcToken(
	env: Env,
	payload: QcTokenPayload,
	opts?: { ttlMs?: number; now?: number }
): Promise<string> {
	const secret = resolveSecret(env);
	const now = opts?.now ?? Date.now();
	const wire: WirePayload = {
		p: payload.projectId,
		s: payload.supplierId,
		e: now + (opts?.ttlMs ?? DEFAULT_TTL_MS)
	};
	const payloadB64 = bytesToB64Url(encoder.encode(JSON.stringify(wire)));
	const sig = await hmac(secret, payloadB64);
	return `${payloadB64}.${sig}`;
}

/**
 * Verify a token's signature + expiry and return the ids, or `null` when the
 * token is malformed, tampered, or expired. Throws only when the secret is
 * missing (server misconfiguration, not a bad token).
 */
export async function verifyQcToken(
	env: Env,
	token: string,
	opts?: { now?: number }
): Promise<QcTokenPayload | null> {
	const secret = resolveSecret(env);
	const dot = token.indexOf('.');
	if (dot <= 0) return null;
	const payloadB64 = token.slice(0, dot);
	const sig = token.slice(dot + 1);

	const expected = await hmac(secret, payloadB64);
	if (!timingSafeEqual(sig, expected)) return null;

	let wire: WirePayload;
	try {
		wire = JSON.parse(decoder.decode(b64UrlToBytes(payloadB64))) as WirePayload;
	} catch {
		return null;
	}
	if (!wire || typeof wire.p !== 'string' || typeof wire.s !== 'string') return null;
	const now = opts?.now ?? Date.now();
	if (typeof wire.e !== 'number' || wire.e < now) return null;

	return { projectId: wire.p, supplierId: wire.s };
}
