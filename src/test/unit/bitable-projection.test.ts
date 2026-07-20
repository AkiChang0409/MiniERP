import { describe, it, expect, vi } from 'vitest';

/**
 * B5 shared projection primitives: read the mirror + map each record into a DTO
 * (loadBitableProjection) or a recordId→DTO index for link resolution
 * (loadBitableLinkIndex).
 */
const RECORDS = [
	{ recordId: 'rec1', fields: { Name: 'Alpha', N: 1 } },
	{ recordId: 'rec2', fields: { Name: 'Beta', N: 2 } }
];

vi.mock('$platform/integrations/lark/bitable-read', async (orig) => {
	const actual = await orig<typeof import('$platform/integrations/lark/bitable-read')>();
	return { ...actual, readBitableRecords: vi.fn(async () => RECORDS) };
});

import {
	loadBitableProjection,
	loadBitableLinkIndex
} from '$platform/integrations/lark/bitable-projection';

const db = {} as never;

describe('bitable-projection primitives', () => {
	it('loadBitableProjection maps each mirror record via the mapper', async () => {
		const out = await loadBitableProjection(db, 'tblX', (recordId, fields) => ({
			id: recordId,
			name: String(fields.Name)
		}));
		expect(out).toEqual([
			{ id: 'rec1', name: 'Alpha' },
			{ id: 'rec2', name: 'Beta' }
		]);
	});

	it('loadBitableLinkIndex builds a recordId → DTO map', async () => {
		const index = await loadBitableLinkIndex(db, 'tblX', (recordId, fields) => ({
			id: recordId,
			n: Number(fields.N)
		}));
		expect(index.size).toBe(2);
		expect(index.get('rec2')).toEqual({ id: 'rec2', n: 2 });
		expect(index.get('missing')).toBeUndefined();
	});
});
