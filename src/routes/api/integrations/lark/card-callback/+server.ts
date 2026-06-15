import { json, type RequestHandler } from '@sveltejs/kit';
import { fail } from '$platform/http';
import {
	asString,
	handleUrlVerification,
	rejectEncryptedCallback,
	resolveVerificationToken,
	verifyCallbackToken
} from '$platform/integrations/lark/verify';

/**
 * Lark (Feishu) interactive-card callback — the "回调配置" endpoint.
 *
 * Fires when a user clicks a button / selects an option on an interactive card
 * the bot previously sent. This is distinct from the event webhook (which
 * delivers chat messages) but shares the same verification token and the
 * url_verification handshake.
 *
 * Card action dispatch is intentionally NOT wired up yet: the bot does not send
 * interactive cards today — replies are plain text, and writes go through the
 * text confirmation loop in ./webhook. This endpoint verifies + acks so the
 * callback URL can be saved/verified in the Lark console now; per-button
 * business logic plugs into handleCardAction() once cards start being sent
 * (mirror the guarded-capability flow in ./webhook).
 */

interface LarkCardAction {
	/** The button/select `value` payload defined on the card element. */
	value?: unknown;
	/** Element tag, e.g. "button" / "select_static". */
	tag?: string;
	/** Selected option (for select elements). */
	option?: string;
	[key: string]: unknown;
}

/** Best-effort open_id extraction across legacy (top-level) + v2 (operator) shapes. */
function extractOpenId(body: Record<string, unknown>): string | undefined {
	const topLevel = asString(body.open_id);
	if (topLevel) return topLevel;
	const operator = body.operator as Record<string, unknown> | undefined;
	return asString(operator?.open_id);
}

export const POST: RequestHandler = async (event) => {
	const tokenResult = resolveVerificationToken(event.platform?.env);
	if ('response' in tokenResult) return tokenResult.response;
	const expectedToken = tokenResult.token;

	const rawBody = await event.request.text();
	let body: Record<string, unknown>;
	try {
		body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
	} catch {
		return fail('Invalid JSON body', 400);
	}

	const encrypted = rejectEncryptedCallback(body);
	if (encrypted) return encrypted;

	// Lark verifies this callback URL with its own url_verification handshake.
	const handshake = handleUrlVerification(body, expectedToken);
	if (handshake) return handshake;

	// Real card callback — verify the token before trusting any field.
	if (!verifyCallbackToken(body, expectedToken)) {
		return fail('Invalid verification token', 401);
	}

	const action = body.action as LarkCardAction | undefined;
	const openId = extractOpenId(body);
	console.log(
		`[lark] card action from ${openId ?? '(unknown)'} tag=${action?.tag ?? 'n/a'} value=${JSON.stringify(
			action?.value ?? null
		)}`
	);

	// TODO: dispatch card actions to guarded capabilities once the bot sends
	// interactive cards. Until then, ACK with an empty body so the card simply
	// clears its loading state. Returning a card JSON here would replace it.
	return json({});
};
