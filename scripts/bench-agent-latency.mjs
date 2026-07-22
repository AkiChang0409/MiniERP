#!/usr/bin/env node
/**
 * Black-box P95 latency benchmark for the unified Agent tool-call loop.
 *
 * Hits `POST /api/ai/agent` (src/routes/api/ai/agent/+server.ts) with a fixed
 * set of read-only, cross-domain natural-language questions. Each request
 * exercises the full path: orchestrator routing -> runWithTools() ReAct loop
 * -> executeGuardedCapability (policy + schema + audit) -> capability read
 * (Bitable mirror / D1) -> LLM answer synthesis. This is the number that
 * matters for a resume bullet: what a user actually waits for.
 *
 * Requires `wrangler dev` (npm run dev:cf / dev:cf:local) — the plain Vite
 * dev server has no Cloudflare platform bindings and /api/ai/agent 500s
 * without them.
 *
 * Usage:
 *   node scripts/bench-agent-latency.mjs [options]
 *
 * Options (env var alternative in parens):
 *   --base-url <url>      (BENCH_BASE_URL)      default http://localhost:5173
 *   --email <email>       (BENCH_EMAIL)         required
 *   --password <pw>       (BENCH_PASSWORD)      required
 *   --register            (BENCH_REGISTER=1)    sign up if sign-in fails (local dev only)
 *   --auth-origin <url>   (BENCH_AUTH_ORIGIN)   Origin header for /api/auth calls; must match
 *                                               BETTER_AUTH_URL's origin (wrangler.jsonc), which in
 *                                               local wrangler dev is often NOT localhost
 *   --requests <n>        (BENCH_REQUESTS)      per-query repeat count, default 20
 *   --concurrency <n>     (BENCH_CONCURRENCY)   default 1 (sequential, user-perceived latency)
 *   --warmup <n>          (BENCH_WARMUP)        default 2, unmeasured requests before timing starts
 *   --out <path>          (BENCH_OUT)           default reports/agent-latency-<timestamp>.json
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import http from 'node:http';
import https from 'node:https';

function parseArgs(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith('--')) continue;
		const key = a.slice(2);
		const next = argv[i + 1];
		if (next === undefined || next.startsWith('--')) {
			out[key] = true;
		} else {
			out[key] = next;
			i++;
		}
	}
	return out;
}

const args = parseArgs(process.argv.slice(2));

const config = {
	baseUrl: (args['base-url'] ?? process.env.BENCH_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
	email: args.email ?? process.env.BENCH_EMAIL,
	password: args.password ?? process.env.BENCH_PASSWORD,
	register: Boolean(args.register ?? process.env.BENCH_REGISTER),
	// better-auth enforces Origin against `trustedOrigins` (= BETTER_AUTH_URL's
	// origin, see src/platform/auth/better-auth.ts). In local wrangler dev that
	// env var is usually still the deployed workers.dev URL, not localhost —
	// so the Origin header sent here must match BETTER_AUTH_URL, not baseUrl.
	authOrigin: args['auth-origin'] ?? process.env.BENCH_AUTH_ORIGIN,
	requestsPerQuery: Number(args.requests ?? process.env.BENCH_REQUESTS ?? 20),
	concurrency: Number(args.concurrency ?? process.env.BENCH_CONCURRENCY ?? 1),
	warmup: Number(args.warmup ?? process.env.BENCH_WARMUP ?? 2),
	out: args.out ?? process.env.BENCH_OUT ?? `reports/agent-latency-${Date.now()}.json`
};

if (!config.email || !config.password) {
	console.error('Missing --email/--password (or BENCH_EMAIL/BENCH_PASSWORD).');
	console.error('This must be a real dev-environment login — register one first at /register,');
	console.error('or pass --register to let this script sign it up via POST /api/auth/sign-up/email');
	console.error('(local dev only; the first registered user becomes owner role).');
	process.exit(1);
}

// One representative read-only query per domain/module so the benchmark
// covers the actual spread of "core business API" capabilities the agent
// loop can call (see src/modules/*/ai-capabilities.ts + finance capabilities).
const QUERIES = [
	{ domain: 'finance', message: 'List the most recent customer invoices.' },
	{ domain: 'finance', message: 'Show me the outstanding supplier invoices.' },
	{ domain: 'project', message: 'List all active projects.' },
	{ domain: 'project', message: 'What tasks are open across all projects?' },
	{ domain: 'sales-crm', message: 'List our customers.' },
	{ domain: 'inventory', message: "What's the current inventory stock status?" },
	{ domain: 'hr', message: 'Show pending leave requests.' }
];

// Node's global fetch (undici) silently overrides a manually-set `Origin`
// header instead of sending ours, which breaks better-auth's CSRF origin
// check. Use raw http/https for the two auth calls to send it verbatim.
function rawPost(urlStr, bodyObj, extraHeaders) {
	return new Promise((resolve, reject) => {
		const url = new URL(urlStr);
		const body = JSON.stringify(bodyObj);
		const mod = url.protocol === 'https:' ? https : http;
		const req = mod.request(
			{
				hostname: url.hostname,
				port: url.port || (url.protocol === 'https:' ? 443 : 80),
				path: url.pathname + url.search,
				method: 'POST',
				headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...extraHeaders }
			},
			(res) => {
				let data = '';
				res.on('data', (c) => (data += c));
				res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
			}
		);
		req.on('error', reject);
		req.write(body);
		req.end();
	});
}

function cookieFromSetCookie(setCookieHeader) {
	if (!setCookieHeader) return null;
	const arr = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
	const cookie = arr.map((c) => c.split(';')[0]).join('; ');
	return cookie || null;
}

async function signIn(baseUrl, email, password, origin) {
	const res = await rawPost(`${baseUrl}/api/auth/sign-in/email`, { email, password }, origin ? { origin } : {});
	const cookie = cookieFromSetCookie(res.headers['set-cookie']);
	if (res.status < 200 || res.status >= 300 || !cookie) return null;
	return cookie;
}

async function signUp(baseUrl, email, password, origin) {
	const res = await rawPost(`${baseUrl}/api/auth/sign-up/email`, { email, password, name: 'Bench User' }, origin ? { origin } : {});
	const cookie = cookieFromSetCookie(res.headers['set-cookie']);
	if (res.status < 200 || res.status >= 300) {
		throw new Error(`sign-up failed (${res.status}): ${res.body}`);
	}
	return cookie;
}

async function authenticate() {
	const origin = config.authOrigin;
	let cookie = await signIn(config.baseUrl, config.email, config.password, origin);
	if (cookie) return cookie;
	if (!config.register) {
		throw new Error(
			`Sign-in failed for ${config.email}. Register the account first at ${config.baseUrl}/register, ` +
				`or re-run with --register to auto sign-up (local dev only). If you see a "Missing or null ` +
				`Origin" / CSRF error, pass --auth-origin matching BETTER_AUTH_URL (see wrangler.jsonc).`
		);
	}
	console.log(`Sign-in failed, registering ${config.email} via sign-up (local dev)...`);
	cookie = await signUp(config.baseUrl, config.email, config.password, origin);
	if (!cookie) throw new Error('sign-up did not return a session cookie (autoSignIn may be disabled).');
	return cookie;
}

async function callAgent(cookie, message) {
	const conversationId = `bench:${crypto.randomUUID()}`;
	const start = performance.now();
	let status = 0;
	let kind = null;
	let ok = false;
	let toolFailed = false;
	let toolError = null;
	try {
		const res = await fetch(`${config.baseUrl}/api/ai/agent`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie },
			body: JSON.stringify({ message, conversationId })
		});
		status = res.status;
		const body = await res.json().catch(() => null);
		const steps = body?.data?.trace?.steps;
		if (Array.isArray(steps)) {
			const failedStep = steps.find((s) => s.ok === false || s.status === 'failed');
			if (failedStep) {
				toolFailed = true;
				toolError = `${failedStep.toolId}: ${failedStep.error ?? failedStep.status}`;
			}
		}
		kind = body?.data?.kind ?? null;
		// A 200 + {ok:true} envelope only means the orchestrator loop completed and
		// produced *some* answer — it says nothing about whether the underlying
		// capability/tool call actually succeeded. Both must hold for this sample
		// to count as a real, representative business-API round trip.
		ok = res.ok && body?.ok === true && kind !== 'error' && kind !== 'denied' && !toolFailed;
	} catch (err) {
		status = -1;
		kind = `network_error: ${err.message}`;
	}
	const ms = performance.now() - start;
	return { ms, status, kind, ok, toolFailed, toolError };
}

async function runWithConcurrency(tasks, limit) {
	const results = new Array(tasks.length);
	let next = 0;
	async function worker() {
		while (next < tasks.length) {
			const i = next++;
			results[i] = await tasks[i]();
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
	return results;
}

function percentile(sortedAsc, p) {
	if (sortedAsc.length === 0) return null;
	const idx = Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1);
	return sortedAsc[Math.max(0, idx)];
}

function summarize(samples) {
	const okLatencies = samples.filter((s) => s.ok).map((s) => s.ms).sort((a, b) => a - b);
	const errorCount = samples.length - okLatencies.length;
	return {
		count: samples.length,
		errorCount,
		errorRate: samples.length ? errorCount / samples.length : 0,
		p50: percentile(okLatencies, 50),
		p95: percentile(okLatencies, 95),
		p99: percentile(okLatencies, 99),
		min: okLatencies[0] ?? null,
		max: okLatencies[okLatencies.length - 1] ?? null
	};
}

function fmt(ms) {
	return ms === null || ms === undefined ? 'n/a' : `${ms.toFixed(0)}ms`;
}

async function main() {
	console.log(`Target: ${config.baseUrl}  |  ${config.requestsPerQuery} req/query x ${QUERIES.length} queries  |  concurrency=${config.concurrency}`);
	const cookie = await authenticate();
	console.log('Authenticated.');

	// Warm-up: first request after a cold wrangler dev start (or cold LLM
	// provider connection) is not representative — exclude from measurement.
	if (config.warmup > 0) {
		console.log(`Warming up (${config.warmup} unmeasured requests)...`);
		for (let i = 0; i < config.warmup; i++) {
			await callAgent(cookie, QUERIES[i % QUERIES.length].message);
		}
	}

	const allSamples = [];
	const byDomain = {};

	for (const query of QUERIES) {
		const tasks = Array.from({ length: config.requestsPerQuery }, () => () => callAgent(cookie, query.message));
		const samples = await runWithConcurrency(tasks, config.concurrency);
		const tagged = samples.map((s) => ({ ...s, domain: query.domain, message: query.message }));
		allSamples.push(...tagged);
		byDomain[query.domain] = (byDomain[query.domain] ?? []).concat(tagged);
		const s = summarize(tagged);
		console.log(
			`[${query.domain}] "${query.message}" -> p50=${fmt(s.p50)} p95=${fmt(s.p95)} p99=${fmt(s.p99)} ` +
				`min=${fmt(s.min)} max=${fmt(s.max)} errors=${s.errorCount}/${s.count}`
		);
		const sampleFailure = tagged.find((t) => t.toolFailed || t.status < 0 || t.status >= 400);
		if (sampleFailure) {
			console.log(`  sample failure: status=${sampleFailure.status} kind=${sampleFailure.kind} toolError=${sampleFailure.toolError}`);
		}
	}

	console.log('\n--- By domain ---');
	const domainSummary = {};
	for (const [domain, samples] of Object.entries(byDomain)) {
		domainSummary[domain] = summarize(samples);
		const s = domainSummary[domain];
		console.log(`${domain.padEnd(12)} p50=${fmt(s.p50)} p95=${fmt(s.p95)} p99=${fmt(s.p99)} errors=${s.errorCount}/${s.count}`);
	}

	const overall = summarize(allSamples);
	console.log('\n--- Overall (all domains combined) ---');
	console.log(`count=${overall.count} p50=${fmt(overall.p50)} p95=${fmt(overall.p95)} p99=${fmt(overall.p99)} min=${fmt(overall.min)} max=${fmt(overall.max)} errorRate=${(overall.errorRate * 100).toFixed(1)}%`);

	if (overall.errorRate > 0.05) {
		console.warn('\nWARNING: error rate above 5% — latency numbers below may not be representative. Check the errors before quoting P95.');
	}

	const report = {
		generatedAt: new Date().toISOString(),
		config: { baseUrl: config.baseUrl, requestsPerQuery: config.requestsPerQuery, concurrency: config.concurrency, warmup: config.warmup, queryCount: QUERIES.length },
		overall,
		byDomain: domainSummary,
		samples: allSamples
	};

	await mkdir(dirname(config.out), { recursive: true });
	await writeFile(config.out, JSON.stringify(report, null, 2));
	console.log(`\nFull report written to ${config.out}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
