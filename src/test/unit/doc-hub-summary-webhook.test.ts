import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Doc Hub auto-summary webhook route. Covers record_id extraction from the
 * various shapes a Lark automation HTTP node can post, the bearer-secret gate,
 * and the sync vs fire-and-forget response contract. The pipeline itself is
 * mocked.
 */

const summarizeDocHubRecord = vi.fn();
vi.mock('$platform/integrations/lark/doc-hub-summary', () => ({
	summarizeDocHubRecord: (...a: unknown[]) => summarizeDocHubRecord(...a)
}));

import { POST } from '../../routes/api/integrations/lark/doc-hub-summary/+server';

function event(opts: {
	body: unknown;
	env?: Record<string, unknown>;
	headers?: Record<string, string>;
	query?: string;
}) {
	const url = `https://example.com/api/integrations/lark/doc-hub-summary${opts.query ?? ''}`;
	const request = new Request(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
		body: JSON.stringify(opts.body)
	});
	return { request, platform: { env: opts.env ?? {}, ctx: { waitUntil: () => {} } } } as never;
}

async function readJson(res: Response) {
	return (await res.json()) as { ok: boolean; data?: Record<string, unknown>; error?: string };
}

beforeEach(() => {
	vi.clearAllMocks();
	summarizeDocHubRecord.mockResolvedValue({ ok: true, recordId: 'rec1', summary: 's', provider: 'workers_ai' });
});

describe('doc-hub-summary webhook', () => {
	it('extracts a top-level record_id and ACKs', async () => {
		const res = await POST(event({ body: { record_id: 'recTOP' } }));
		const data = await readJson(res);
		expect(data).toEqual({ ok: true, data: { accepted: true, recordId: 'recTOP' } });
		expect(summarizeDocHubRecord).toHaveBeenCalledWith({}, 'recTOP');
	});

	it('extracts a nested record_id (Lark event.record shape)', async () => {
		const res = await POST(event({ body: { event: { record: { record_id: 'recNEST', fields: {} } } } }));
		await res.json();
		expect(summarizeDocHubRecord).toHaveBeenCalledWith({}, 'recNEST');
	});

	it('falls back to a record object using `id` + `fields`', async () => {
		const res = await POST(event({ body: { record: { id: 'recID', fields: { Name: 'x' } } } }));
		await res.json();
		expect(summarizeDocHubRecord).toHaveBeenCalledWith({}, 'recID');
	});

	it('accepts record_id from the query string', async () => {
		const res = await POST(event({ body: {}, query: '?record_id=recQUERY' }));
		await res.json();
		expect(summarizeDocHubRecord).toHaveBeenCalledWith({}, 'recQUERY');
	});

	it('400s when no record_id is present', async () => {
		const res = await POST(event({ body: { something: 'else' } }));
		expect(res.status).toBe(400);
		expect(summarizeDocHubRecord).not.toHaveBeenCalled();
	});

	it('401s when a secret is configured and the bearer is missing/wrong', async () => {
		const res = await POST(event({ body: { record_id: 'r' }, env: { LARK_DOCHUB_WEBHOOK_SECRET: 'sek' } }));
		expect(res.status).toBe(401);
		expect(summarizeDocHubRecord).not.toHaveBeenCalled();
	});

	it('accepts a correct bearer secret', async () => {
		const res = await POST(
			event({
				body: { record_id: 'r' },
				env: { LARK_DOCHUB_WEBHOOK_SECRET: 'sek' },
				headers: { authorization: 'Bearer sek' }
			})
		);
		expect(res.status).toBe(200);
		expect(summarizeDocHubRecord).toHaveBeenCalled();
	});

	it('sync=1 runs the pipeline inline and returns the result', async () => {
		const res = await POST(event({ body: { record_id: 'recSYNC' }, query: '?sync=1' }));
		const data = await readJson(res);
		expect(res.status).toBe(200);
		expect(data.data).toMatchObject({ ok: true, summary: 's' });
	});

	it('sync=1 returns 422 when the pipeline fails', async () => {
		summarizeDocHubRecord.mockResolvedValueOnce({ ok: false, recordId: 'recBAD', reason: 'no text' });
		const res = await POST(event({ body: { record_id: 'recBAD' }, query: '?sync=1' }));
		expect(res.status).toBe(422);
	});
});
