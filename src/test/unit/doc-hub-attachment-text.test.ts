import { describe, it, expect, vi } from 'vitest';

/**
 * Doc Hub attachment → text bridge used by the MCP endpoint. Attachment
 * fields are duck-typed (array of `{file_token,...}`) rather than matched by
 * field name, since the Doc Hub attachment column's name isn't pinned by env.
 */

const bitableGetRecord = vi.fn();
const bitableDownloadMedia = vi.fn();
vi.mock('$platform/integrations/lark/bitable', async (orig) => {
	const actual = await orig<typeof import('$platform/integrations/lark/bitable')>();
	return {
		...actual,
		larkDocHubTarget: () => ({ appToken: 'appTok', tableId: 'tblDocHub' }),
		bitableGetRecord: (...args: unknown[]) => bitableGetRecord(...args),
		bitableDownloadMedia: (...args: unknown[]) => bitableDownloadMedia(...args),
		bitableTableRevision: async () => 1
	};
});

const extractTextFromBytesRaw = vi.fn();
vi.mock('$platform/ai/text-extraction', () => ({
	extractTextFromBytesRaw: (...args: unknown[]) => extractTextFromBytesRaw(...args)
}));

import {
	collectAttachmentFiles,
	extractDocHubRecordText
} from '$platform/integrations/lark/doc-hub-attachment-text';

describe('collectAttachmentFiles', () => {
	it('picks out attachment-shaped array fields regardless of field name', () => {
		const files = collectAttachmentFiles({
			'Contract Number': 'C-001',
			附件: [{ file_token: 'tok1', name: 'a.pdf', type: 'application/pdf' }],
			'Other Files': [{ file_token: 'tok2', name: 'b.png', type: 'image/png' }],
			Tags: ['x', 'y'] // array, but not attachment-shaped — must be ignored
		});
		expect(files).toEqual([
			{ fileToken: 'tok1', name: 'a.pdf', mimeType: 'application/pdf' },
			{ fileToken: 'tok2', name: 'b.png', mimeType: 'image/png' }
		]);
	});

	it('returns empty for a record with no attachment fields', () => {
		expect(collectAttachmentFiles({ Name: 'no files here' })).toEqual([]);
	});
});

describe('extractDocHubRecordText', () => {
	const env = {} as Env;

	it('returns empty text when the record has no attachments', async () => {
		bitableGetRecord.mockResolvedValueOnce({ record_id: 'rec1', fields: { Name: 'x' } });
		const result = await extractDocHubRecordText(env, 'rec1');
		expect(result).toEqual({ recordId: 'rec1', files: [], text: '' });
	});

	it('downloads and extracts a single attachment without a filename header', async () => {
		bitableGetRecord.mockResolvedValueOnce({
			record_id: 'rec2',
			fields: { File: [{ file_token: 'tok1', name: 'invoice.pdf', type: 'application/pdf' }] }
		});
		bitableDownloadMedia.mockResolvedValueOnce({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'application/pdf' });
		extractTextFromBytesRaw.mockResolvedValueOnce({ status: 'success', text: 'Invoice total: 100' });

		const result = await extractDocHubRecordText(env, 'rec2');
		expect(result.text).toBe('Invoice total: 100');
		expect(result.files).toEqual([{ name: 'invoice.pdf', status: 'success', text: 'Invoice total: 100', error: undefined }]);
	});

	it('concatenates multiple attachments with per-file headers', async () => {
		bitableGetRecord.mockResolvedValueOnce({
			record_id: 'rec3',
			fields: {
				File: [
					{ file_token: 'tokA', name: 'a.pdf', type: 'application/pdf' },
					{ file_token: 'tokB', name: 'b.pdf', type: 'application/pdf' }
				]
			}
		});
		bitableDownloadMedia
			.mockResolvedValueOnce({ bytes: new Uint8Array(), mimeType: 'application/pdf' })
			.mockResolvedValueOnce({ bytes: new Uint8Array(), mimeType: 'application/pdf' });
		extractTextFromBytesRaw
			.mockResolvedValueOnce({ status: 'success', text: 'first' })
			.mockResolvedValueOnce({ status: 'success', text: 'second' });

		const result = await extractDocHubRecordText(env, 'rec3');
		expect(result.text).toBe('--- a.pdf ---\nfirst\n\n--- b.pdf ---\nsecond');
	});

	it('records a failed download as a per-file error, not a thrown exception', async () => {
		bitableGetRecord.mockResolvedValueOnce({
			record_id: 'rec4',
			fields: { File: [{ file_token: 'tokX', name: 'x.pdf', type: 'application/pdf' }] }
		});
		bitableDownloadMedia.mockRejectedValueOnce(new Error('boom'));

		const result = await extractDocHubRecordText(env, 'rec4');
		expect(result.files).toEqual([{ name: 'x.pdf', status: 'failed', text: '', error: 'boom' }]);
		expect(result.text).toBe('');
	});
});
