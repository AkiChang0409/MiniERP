/**
 * LLM-based attachment routing for EML files.
 *
 * Feeds the cleaned email body + full attachment filename list to a small,
 * fast LLM and asks it to identify which attachments are financially relevant.
 * This replaces the keyword-scoring heuristic for the attachment selection step
 * inside composeEmlText.
 *
 * Returns the list of filenames the LLM selected, validated against the actual
 * attachment list (prevents hallucination leaking through).
 * Returns null on any failure — caller must fall back to keyword scoring.
 */

import type { EmlStructuredResult } from './parse-eml';

const ROUTING_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const SYSTEM_PROMPT = `You are a document routing assistant for a financial management system.
Given an email and its list of attachments, identify which attachments are financially relevant documents.
Financially relevant: invoices, receipts, purchase orders, contracts, quotations, delivery orders, statements, tax documents.
NOT financially relevant: logos, email signatures, banners, social icons, avatars, decorative images.

Respond with ONLY valid JSON in this exact format (no markdown, no explanation):
{"filenames": ["example.pdf", "invoice.png"]}

If no attachments are financially relevant, respond with: {"filenames": []}`;

/** Extract JSON object from LLM response, tolerating markdown code fences. */
function parseRoutingResponse(raw: string): string[] | null {
	// Strip markdown code fences if present
	const cleaned = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

	// Find the first { ... } block
	const start = cleaned.indexOf('{');
	const end = cleaned.lastIndexOf('}');
	if (start === -1 || end === -1 || end <= start) return null;

	try {
		const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
		if (
			parsed !== null &&
			typeof parsed === 'object' &&
			'filenames' in parsed &&
			Array.isArray((parsed as { filenames: unknown }).filenames)
		) {
			return ((parsed as { filenames: unknown[] }).filenames)
				.filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
				.map((f) => f.trim());
		}
	} catch {
		// fall through
	}
	return null;
}

function extractResponseText(raw: unknown): string {
	if (typeof raw === 'string') return raw;
	if (raw === null || typeof raw !== 'object') return '';
	const o = raw as Record<string, unknown>;
	if (typeof o.response === 'string') return o.response;
	if (typeof o.result === 'string') return o.result;
	const choices = o.choices as Array<{ message?: { content?: unknown } }> | undefined;
	const content = choices?.[0]?.message?.content;
	if (typeof content === 'string') return content;
	return '';
}

const ROUTING_BODY_CAP = 1_000;
const ROUTING_FILENAME_CAP = 60;

/**
 * Ask a small LLM to select which attachments are financially relevant.
 *
 * @returns Validated list of filenames from `attachmentFilenames`, or null if
 *          the call failed or returned unusable output (caller falls back to
 *          keyword scoring).
 */
export async function routeEmlAttachmentsViaLlm(
	structured: EmlStructuredResult,
	env: Env
): Promise<string[] | null> {
	if (!env.AI) return null;

	const { subject, from, bodyText, attachments } = structured;

	// Nothing to route if there are no attachments
	if (attachments.length === 0) return null;

	// Build the user prompt
	const headerLines: string[] = [];
	if (from) headerLines.push(`From: ${from.slice(0, 100)}`);
	if (subject) headerLines.push(`Subject: ${subject.slice(0, 150)}`);

	const body = bodyText
		? bodyText.length > ROUTING_BODY_CAP
			? bodyText.slice(0, ROUTING_BODY_CAP) + '[...]'
			: bodyText
		: '(no body)';

	const filenameList = attachments
		.map((a) => `- ${a.filename.slice(0, ROUTING_FILENAME_CAP)} (${a.mimeType})`)
		.join('\n');

	const userPrompt =
		`${headerLines.join('\n')}\n\nEmail body:\n${body}\n\nAttachments:\n${filenameList}\n\n` +
		`Which attachments are financially relevant documents?`;

	try {
		const raw = await env.AI.run(
			ROUTING_MODEL as Parameters<NonNullable<Env['AI']>['run']>[0],
			{
				messages: [
					{ role: 'system' as const, content: SYSTEM_PROMPT },
					{ role: 'user' as const, content: userPrompt }
				],
				max_tokens: 256,
				temperature: 0.1
			} as Parameters<NonNullable<Env['AI']>['run']>[1]
		);

		const text = extractResponseText(raw).trim();
		if (!text) return null;

		const selected = parseRoutingResponse(text);
		if (!selected) return null;

		// Validate against actual attachment list to prevent hallucination.
		// Case-insensitive match since LLM may alter casing slightly.
		const actualNames = new Set(attachments.map((a) => a.filename.toLowerCase()));
		const validated = selected.filter((f) => actualNames.has(f.toLowerCase()));

		return validated.length > 0 ? validated : null;
	} catch {
		return null;
	}
}
