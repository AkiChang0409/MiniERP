type JsonLike = Record<string, unknown> | unknown[];
export type AiProviderUsed = 'workers_ai' | 'external_api' | 'none';

type AiJsonCallInput = {
	system: string;
	user: string;
	promptVersion?: string;
};

function readEnv(platformEnv: Env, key: string): string {
	const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
	const fromPlatform = (platformEnv as unknown as Record<string, unknown>)[key];
	if (typeof fromPlatform === 'string' && fromPlatform.trim()) return fromPlatform.trim();
	const fromProcess = processEnv?.[key];
	return typeof fromProcess === 'string' ? fromProcess.trim() : '';
}

function tryParseJson(raw: string): unknown | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	try {
		return JSON.parse(trimmed) as unknown;
	} catch {
		return null;
	}
}

/** Best-effort: pull first `{...}` balancing strings (weak models often wrap JSON in prose or fences). */
function extractBalancedJsonObject(s: string): string | null {
	const start = s.indexOf('{');
	if (start < 0) return null;
	let depth = 0;
	let inString = false;
	let escape = false;
	for (let i = start; i < s.length; i++) {
		const c = s[i];
		if (escape) {
			escape = false;
			continue;
		}
		if (c === '\\' && inString) {
			escape = true;
			continue;
		}
		if (c === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;
		if (c === '{') depth++;
		else if (c === '}') {
			depth--;
			if (depth === 0) return s.slice(start, i + 1);
		}
	}
	return null;
}

/** Parse JSON from model output: strict, then ```json``` fence, then first balanced object. */
function parseLooseModelJson(text: string): unknown | null {
	const direct = tryParseJson(text);
	if (direct !== null) return direct;
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fenced?.[1]) {
		const inner = tryParseJson(fenced[1].trim());
		if (inner !== null) return inner;
		const balanced = extractBalancedJsonObject(fenced[1]);
		if (balanced) return tryParseJson(balanced);
	}
	const balanced = extractBalancedJsonObject(text);
	return balanced ? tryParseJson(balanced) : null;
}

function pickJsonFromUnknown(input: unknown): unknown | null {
	if (input === null || input === undefined) return null;
	if (typeof input === 'string') return parseLooseModelJson(input);
	if (Array.isArray(input)) return input;
	if (typeof input === 'object') {
		const obj = input as Record<string, unknown>;
		if (typeof obj.response === 'string') {
			const parsed = parseLooseModelJson(obj.response);
			if (parsed !== null) return parsed;
		}
		if (typeof obj.output_text === 'string') {
			const parsed = parseLooseModelJson(obj.output_text);
			if (parsed !== null) return parsed;
		}
		if (typeof obj.text === 'string') {
			const parsed = parseLooseModelJson(obj.text);
			if (parsed !== null) return parsed;
		}
		if (Array.isArray(obj.result)) return obj.result;
		return obj;
	}
	return null;
}

async function callWorkersAiJson(env: Env, input: AiJsonCallInput): Promise<unknown> {
	if (!env.AI) return null;
	const model = readEnv(env, 'WORKERS_AI_MODEL') || '@cf/meta/llama-3.1-8b-instruct';
	const modelKey = model as Parameters<NonNullable<Env['AI']>['run']>[0];
	const systemFull = input.promptVersion
		? `${input.system}\nPrompt version: ${input.promptVersion}`
		: input.system;

	const maxTokensRaw = readEnv(env, 'WORKERS_AI_MAX_TOKENS');
	const maxTokens = Math.min(8192, Math.max(256, Number.parseInt(maxTokensRaw, 10) || 2048));
	const jsonModePreferred = readEnv(env, 'WORKERS_AI_JSON_MODE').toLowerCase() !== 'false';

	const run = async (userContent: string, useJsonMode: boolean): Promise<unknown> => {
		const opts: Record<string, unknown> = {
			messages: [
				{ role: 'system', content: systemFull },
				{ role: 'user', content: userContent }
			],
			temperature: 0,
			max_tokens: maxTokens
		};
		if (useJsonMode) opts.response_format = { type: 'json_object' };
		return env.AI!.run(modelKey, opts as Parameters<NonNullable<Env['AI']>['run']>[1]);
	};

	let raw: unknown;
	try {
		raw = await run(input.user, jsonModePreferred);
	} catch {
		if (!jsonModePreferred) return null;
		try {
			raw = await run(input.user, false);
		} catch {
			return null;
		}
	}

	let parsed = pickJsonFromUnknown(raw);
	if (parsed !== null) return parsed;

	const retryHint =
		'\n\nYou must reply with one JSON object only. No markdown code fences, no explanation text before or after.';
	try {
		raw = await run(input.user + retryHint, jsonModePreferred);
	} catch {
		try {
			raw = await run(input.user + retryHint, false);
		} catch {
			return null;
		}
	}
	parsed = pickJsonFromUnknown(raw);
	return parsed;
}

async function callExternalApiJson(env: Env, input: AiJsonCallInput): Promise<unknown> {
	const apiUrl = readEnv(env, 'LLM_API_URL');
	if (!apiUrl) return null;

	/**
	 * External HTTP LLM is used when `LLM_API_URL` is set (e.g. OpenAI-compatible endpoint).
	 * Previously this only ran when `LLM_PROVIDER=external`, which blocked fallback in local dev
	 * where wrangler defaults to `LLM_PROVIDER=heuristic` even after Workers AI returns null.
	 * Set `LLM_USE_EXTERNAL=false` to disable HTTP LLM calls (Workers + heuristics only).
	 */
	if (readEnv(env, 'LLM_USE_EXTERNAL').toLowerCase() === 'false') return null;

	const apiKey = readEnv(env, 'LLM_API_KEY');

	const promptVersion = input.promptVersion || readEnv(env, 'OCR_PROMPT_VERSION') || 'v1';
	const systemFull = `${input.system}\nPrompt version: ${promptVersion}`;
	const model = readEnv(env, 'OPENAI_MODEL') || readEnv(env, 'LLM_MODEL') || 'gpt-4o-mini';
	const isOpenAiChatEndpoint = /api\.openai\.com\/v1\/chat\/completions/i.test(apiUrl);
	const isAnthropicEndpoint = /api\.anthropic\.com/i.test(apiUrl);

	let init: RequestInit;
	if (isAnthropicEndpoint) {
		// Anthropic Messages API: x-api-key + anthropic-version headers, max_tokens
		// is required, `system` is a top-level field, one user turn. No sampling
		// params / thinking so the request shape stays valid across Sonnet/Opus
		// tiers (Opus 4.7+ reject temperature/top_p).
		init = {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'anthropic-version': '2023-06-01',
				...(apiKey ? { 'x-api-key': apiKey } : {})
			},
			body: JSON.stringify({
				model,
				max_tokens: 2048,
				system: systemFull,
				messages: [{ role: 'user', content: input.user }]
			})
		};
	} else if (isOpenAiChatEndpoint) {
		init = {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
			},
			body: JSON.stringify({
				model,
				temperature: 0,
				response_format: { type: 'json_object' },
				messages: [
					{ role: 'system', content: systemFull },
					{ role: 'user', content: input.user }
				]
			})
		};
	} else {
		init = {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
			},
			body: JSON.stringify({ promptVersion, system: systemFull, input: input.user })
		};
	}

	const response = await fetch(apiUrl, init);
	if (!response.ok) {
		// Surface auth/format errors in the wrangler log instead of silently
		// falling through to heuristics/rule-based.
		console.error(`[llm] external API returned ${response.status} from ${apiUrl}`);
		return null;
	}

	const raw = await response.text();
	try {
		const json = JSON.parse(raw) as Record<string, unknown>;
		if (isAnthropicEndpoint) {
			// Messages API → { content: [{ type: 'text', text: '...' }, ...] }
			const blocks = json.content as Array<{ type?: string; text?: string }> | undefined;
			const text = blocks?.find((b) => b.type === 'text')?.text;
			return typeof text === 'string' ? parseLooseModelJson(text) : null;
		}
		if (isOpenAiChatEndpoint) {
			const choices = json.choices as Array<{ message?: { content?: string } }> | undefined;
			const content = choices?.[0]?.message?.content;
			return typeof content === 'string' ? parseLooseModelJson(content) : null;
		}
		return json;
	} catch {
		return null;
	}
}

export async function callAiJson(env: Env, input: AiJsonCallInput): Promise<unknown> {
	const result = await callAiJsonWithSource(env, input);
	return result.json;
}

export async function callAiJsonWithSource(
	env: Env,
	input: AiJsonCallInput
): Promise<{ json: unknown; provider: AiProviderUsed }> {
	const skipWorkers = readEnv(env, 'LLM_SKIP_WORKERS').toLowerCase() === 'true';

	let fromWorkersAi: unknown = null;
	if (!skipWorkers) {
		fromWorkersAi = await callWorkersAiJson(env, input);
	}
	if (fromWorkersAi !== null) return { json: fromWorkersAi, provider: 'workers_ai' };

	const fromExternalApi = await callExternalApiJson(env, input);
	if (fromExternalApi !== null) return { json: fromExternalApi, provider: 'external_api' };

	return { json: null, provider: 'none' };
}

export function isJsonLike(value: unknown): value is JsonLike {
	if (Array.isArray(value)) return true;
	return value !== null && typeof value === 'object';
}
