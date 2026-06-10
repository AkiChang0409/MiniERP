import type { RequestHandler } from './$types';
import { generateProjectPlan } from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * POST /api/projects/generate-plan
 *   body: { prompt, knownStartDate?, knownDeadline?, historicalDurations? }
 *   → { plan: GeneratedPlan } | 4xx on validation, 502 if LLM unreachable.
 *
 * The plan is returned for client-side review and is NOT persisted by this
 * endpoint — the user accepts/edits, then submits the normal create-project
 * form. Keeps the AI suggestive rather than authoritative.
 */
export const POST: RequestHandler = async (event) => {
	if (!event.platform) {
		return fail('Cloudflare platform bindings are required', 500);
	}
	try {
		const body = (await event.request.json()) as {
			prompt?: string;
			knownStartDate?: string | null;
			knownDeadline?: string | null;
			historicalDurations?: Array<{ projectName: string; durationDays: number }>;
		};
		if (!body.prompt || !body.prompt.trim()) {
			return fail('Provide a project description in the `prompt` field.', 400);
		}
		const run = await generateProjectPlan(
			{
				prompt: body.prompt,
				knownStartDate: body.knownStartDate ?? null,
				knownDeadline: body.knownDeadline ?? null,
				historicalDurations: body.historicalDurations
			},
			event.platform.env
		);
		if (run.status !== 'success' || !run.plan) {
			const code = run.status === 'no_provider' ? 502 : 422;
			return fail(run.errorMessage ?? `Plan generation failed (${run.status}).`, code);
		}
		return ok({ plan: run.plan });
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
