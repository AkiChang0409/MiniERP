import { describe, it, expect, vi } from 'vitest';

/**
 * B4 task write-through encoder. `resolveTaskFields` maps live Bitable columns
 * onto logical fields (alias match); `encodeTaskFields` coerces by the live
 * field TYPE (date → ms, single-select → a matching option, link → record id)
 * and drops anything that didn't resolve.
 */
vi.mock('$platform/integrations/lark/bitable', () => ({
	bitableListFields: vi.fn(async () => [
		{ fieldId: 'f1', name: 'Task Name', type: 1, options: [], property: {} },
		{ fieldId: 'f2', name: '截止日期', type: 5, options: [], property: {} },
		{ fieldId: 'f3', name: 'Status', type: 3, options: ['Unassigned', 'In Progress', 'Done'], property: {} },
		{ fieldId: 'f4', name: 'Projects', type: 18, options: [], property: {} },
		{ fieldId: 'f5', name: 'Notes', type: 1, options: [], property: {} },
		{ fieldId: 'f6', name: 'Priority', type: 3, options: ['P0', 'P1', 'P2', 'P3'], property: {} }
	])
}));

import { resolveTaskFields, encodeTaskFields } from '$modules/project/lark-contracts';

describe('project task write-through — field resolution + encoding', () => {
	it('resolves logical fields from live columns (EN + ZH aliases)', async () => {
		const resolved = await resolveTaskFields({} as Env, 'app_tok', 'tblResolveTest');
		expect(resolved.name?.name).toBe('Task Name');
		expect(resolved.endDate?.name).toBe('截止日期');
		expect(resolved.endDate?.type).toBe(5);
		expect(resolved.status?.name).toBe('Status');
		expect(resolved.project?.name).toBe('Projects');
		expect(resolved.description?.name).toBe('Notes');
		// No "Start Date" column in the fake schema → unresolved.
		expect(resolved.startDate).toBeUndefined();
	});

	it('encodes dates to ms, status to a live option, and the project link', async () => {
		const resolved = await resolveTaskFields({} as Env, 'app_tok', 'tblEncodeTest');
		const fields = encodeTaskFields(
			resolved,
			{
				name: 'Design review',
				description: 'Prep the deck',
				endDate: '2026-07-15',
				status: 'ongoing', // → 'In Progress' via alias
				startDate: '2026-07-01' // no column → dropped
			},
			'recProj123'
		);

		expect(fields['Task Name']).toBe('Design review');
		expect(fields['Notes']).toBe('Prep the deck');
		expect(fields['截止日期']).toBe(Date.parse('2026-07-15')); // date field → ms number
		expect(fields['Status']).toBe('In Progress'); // ongoing → matched option
		expect(fields['Projects']).toEqual(['recProj123']); // link field → [recordId]
		expect('Start Date' in fields).toBe(false);
	});

	it('encodes priority against the P0–P3 options', async () => {
		const resolved = await resolveTaskFields({} as Env, 'app_tok', 'tblPriorityTest');
		const fields = encodeTaskFields(resolved, { name: 'X', priority: 'p1' });
		expect(fields['Priority']).toBe('P1'); // case-insensitive match to live option
		const none = encodeTaskFields(resolved, { name: 'X', priority: 'P9' });
		expect('Priority' in none).toBe(false); // unknown priority dropped
	});

	it('drops the status when no live option matches', async () => {
		const resolved = await resolveTaskFields({} as Env, 'app_tok', 'tblStatusTest');
		const fields = encodeTaskFields(resolved, { name: 'X', status: 'blocked' });
		// Fake schema has no "Blocked"-like option → status omitted.
		expect('Status' in fields).toBe(false);
		expect(fields['Task Name']).toBe('X');
	});
});
