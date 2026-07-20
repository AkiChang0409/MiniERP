import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Doc Hub auto-summary pipeline: read record → extract attachment text →
 * LLM-summarize → write summary into "Doc Content" + flip "Processing Status".
 * Bitable + text-extraction + LLM are all mocked; this pins the orchestration,
 * field resolution, idempotency, and the failure → Failed-status path.
 */

const bitableListFields = vi.fn();
const bitableGetRecord = vi.fn();
const bitableUpdateRecord = vi.fn();
vi.mock('$platform/integrations/lark/bitable', async (orig) => {
	const actual = await orig<typeof import('$platform/integrations/lark/bitable')>();
	return {
		...actual,
		larkDocHubTarget: () => ({ appToken: 'appTok', tableId: 'tblDocHub' }),
		bitableListFields: (...a: unknown[]) => bitableListFields(...a),
		bitableGetRecord: (...a: unknown[]) => bitableGetRecord(...a),
		bitableUpdateRecord: (...a: unknown[]) => bitableUpdateRecord(...a)
	};
});

const extractAttachmentsText = vi.fn();
vi.mock('$platform/integrations/lark/doc-hub-attachment-text', () => ({
	extractAttachmentsText: (...a: unknown[]) => extractAttachmentsText(...a)
}));

const summarizeDocumentText = vi.fn();
vi.mock('$platform/ai/summarize', () => ({
	summarizeDocumentText: (...a: unknown[]) => summarizeDocumentText(...a)
}));

import { summarizeDocHubRecord } from '$platform/integrations/lark/doc-hub-summary';

const env = {} as Env;

const STATUS_FIELD = {
	fieldId: 'fldStatus',
	name: 'Processing Status',
	type: 3,
	options: ['Pending', 'Completed', 'Failed'],
	property: {}
};
const CONTENT_FIELD = { fieldId: 'fldContent', name: 'Doc Content', type: 1, options: [], property: {} };

beforeEach(() => {
	vi.clearAllMocks();
	bitableListFields.mockResolvedValue([CONTENT_FIELD, STATUS_FIELD]);
	bitableUpdateRecord.mockResolvedValue({ record_id: 'rec1', fields: {} });
});

describe('summarizeDocHubRecord', () => {
	it('writes the summary into Doc Content and flips status to Completed', async () => {
		bitableGetRecord.mockResolvedValueOnce({ record_id: 'rec1', fields: { 'Processing Status': 'Pending' } });
		extractAttachmentsText.mockResolvedValueOnce({ files: [{}], text: 'Contract between A and B for $1000.' });
		summarizeDocumentText.mockResolvedValueOnce({ summary: 'A/B contract, $1000.', provider: 'workers_ai' });

		const result = await summarizeDocHubRecord(env, 'rec1');

		expect(result).toEqual({ ok: true, recordId: 'rec1', summary: 'A/B contract, $1000.', provider: 'workers_ai' });
		expect(bitableUpdateRecord).toHaveBeenCalledWith(env, {
			appToken: 'appTok',
			tableId: 'tblDocHub',
			recordId: 'rec1',
			fields: { 'Doc Content': 'A/B contract, $1000.', 'Processing Status': 'Completed' }
		});
	});

	it('is idempotent — skips a record already marked Completed', async () => {
		bitableGetRecord.mockResolvedValueOnce({ record_id: 'rec1', fields: { 'Processing Status': 'Completed' } });

		const result = await summarizeDocHubRecord(env, 'rec1');

		expect(result).toMatchObject({ ok: true, skipped: true });
		expect(extractAttachmentsText).not.toHaveBeenCalled();
		expect(bitableUpdateRecord).not.toHaveBeenCalled();
	});

	it('marks the record Failed when no text could be extracted', async () => {
		bitableGetRecord.mockResolvedValueOnce({ record_id: 'rec1', fields: {} });
		extractAttachmentsText.mockResolvedValueOnce({ files: [{}], text: '   ' });

		const result = await summarizeDocHubRecord(env, 'rec1');

		expect(result).toMatchObject({ ok: false });
		expect(summarizeDocumentText).not.toHaveBeenCalled();
		expect(bitableUpdateRecord).toHaveBeenCalledWith(env, {
			appToken: 'appTok',
			tableId: 'tblDocHub',
			recordId: 'rec1',
			fields: { 'Processing Status': 'Failed' }
		});
	});

	it('marks the record Failed when the LLM returns no summary', async () => {
		bitableGetRecord.mockResolvedValueOnce({ record_id: 'rec1', fields: {} });
		extractAttachmentsText.mockResolvedValueOnce({ files: [{}], text: 'some text' });
		summarizeDocumentText.mockResolvedValueOnce({ summary: '', provider: 'none' });

		const result = await summarizeDocHubRecord(env, 'rec1');

		expect(result).toMatchObject({ ok: false });
		const lastCall = bitableUpdateRecord.mock.calls.at(-1)?.[1];
		expect(lastCall.fields).toEqual({ 'Processing Status': 'Failed' });
	});

	it('resolves aliased field names (e.g. 处理状态 / 文件正文) case-insensitively', async () => {
		bitableListFields.mockResolvedValueOnce([
			{ fieldId: 'f1', name: '文件正文', type: 1, options: [], property: {} },
			{ fieldId: 'f2', name: '处理状态', type: 3, options: ['待处理', '已完成', '失败'], property: {} }
		]);
		bitableGetRecord.mockResolvedValueOnce({ record_id: 'rec9', fields: { 处理状态: '待处理' } });
		extractAttachmentsText.mockResolvedValueOnce({ files: [{}], text: '合同正文' });
		summarizeDocumentText.mockResolvedValueOnce({ summary: '合同摘要', provider: 'external_api' });

		const result = await summarizeDocHubRecord(env, 'rec9');

		expect(result).toMatchObject({ ok: true });
		expect(bitableUpdateRecord).toHaveBeenCalledWith(env, {
			appToken: 'appTok',
			tableId: 'tblDocHub',
			recordId: 'rec9',
			fields: { 文件正文: '合同摘要', 处理状态: '已完成' }
		});
	});
});
