import { describe, it, expect, vi } from 'vitest';

/**
 * P3 read-from-Bitable: project.list-tasks reads the Tasks mirror and can filter
 * to one project by its Bitable record id (via the task's Project link field).
 * This closes the write→read loop — a task written through to Bitable is visible
 * immediately (the write-through upserts the mirror).
 */
const FIXTURE = [
	{
		recordId: 'recTaskA',
		fields: {
			Task: 'PanelTask',
			Priority: 'P0',
			Status: 'Unassigned',
			Project: [{ record_id: 'recProj1' }]
		}
	},
	{
		recordId: 'recTaskB',
		fields: {
			Task: 'OtherTask',
			Project: [{ record_id: 'recProj2' }]
		}
	}
];

vi.mock('$platform/integrations/lark/bitable-read', async (orig) => {
	const actual = await orig<typeof import('$platform/integrations/lark/bitable-read')>();
	return { ...actual, readBitableRecords: vi.fn(async () => FIXTURE) };
});

import { projectListTasksCapability, projectGetTaskCapability } from '$modules/project/ai-capabilities';

const ctx = { moduleContext: { db: {}, env: {} } } as never;

describe('project.list-tasks / get-task (Bitable read)', () => {
	it('filters tasks to the linked project record id', async () => {
		const out = await projectListTasksCapability.execute({ projectId: 'recProj1' }, ctx);
		expect(out.count).toBe(1);
		expect(out.tasks[0].recordId).toBe('recTaskA');
		expect(out.tasks[0].name).toBe('PanelTask');
		expect(out.tasks[0].fields.Priority).toBe('P0');
	});

	it('lists all tasks when no project filter is given', async () => {
		const out = await projectListTasksCapability.execute({}, ctx);
		expect(out.count).toBe(2);
	});

	it('gets one task by record id', async () => {
		const out = await projectGetTaskCapability.execute({ recordId: 'recTaskB' }, ctx);
		expect(out.task?.name).toBe('OtherTask');
		const miss = await projectGetTaskCapability.execute({ recordId: 'nope' }, ctx);
		expect(miss.task).toBeNull();
	});
});
