import { vi, describe, it, expect, beforeEach } from 'vitest';

const createTask = vi.fn(async (input: { name: string }) => ({ id: `new_${input.name}` }));
const updateTask = vi.fn(async (taskId: string) => ({ id: taskId }));

// Intercept the project api facade so the capability's create/update mapping can
// be asserted without a real DB. Both the capability's '../../api' import and
// this alias resolve to src/modules/project/api.ts.
vi.mock('$modules/project/api', () => ({
	createProjectApi: () => ({ createTask, updateTask })
}));

import { applyTaskChangeSetCapability } from '$modules/project/capabilities/apply-task-change-set';

const ctx = { moduleContext: {} } as never;

describe('project.apply-task-change-set', () => {
	beforeEach(() => {
		createTask.mockClear();
		updateTask.mockClear();
	});

	it('maps each change to the right api call', async () => {
		const out = await applyTaskChangeSetCapability.execute(
			{
				projectId: 'p1',
				changes: [
					{ action: 'create', after: { name: 'Kickoff' }, reason: 'new' },
					{
						action: 'reschedule',
						taskId: 't2',
						after: { startDate: '2026-01-02', endDate: '2026-01-03' },
						reason: 'shift'
					},
					{ action: 'assign', taskId: 't3', after: { assigneeId: 'u9' }, reason: 'owner' }
				]
			},
			ctx
		);

		expect(createTask).toHaveBeenCalledTimes(1);
		expect(createTask).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: 'p1', name: 'Kickoff' })
		);
		expect(updateTask).toHaveBeenCalledTimes(2);
		expect(updateTask).toHaveBeenCalledWith('t2', 'p1', expect.objectContaining({ startDate: '2026-01-02' }));
		expect(updateTask).toHaveBeenCalledWith('t3', 'p1', expect.objectContaining({ assigneeId: 'u9' }));
		expect(out.applied).toHaveLength(3);
	});

	it('skips a create without a name and an update without a taskId', async () => {
		const out = await applyTaskChangeSetCapability.execute(
			{
				projectId: 'p1',
				changes: [
					{ action: 'create', after: {}, reason: 'x' },
					{ action: 'update', after: { startDate: '2026-01-02' }, reason: 'x' }
				]
			},
			ctx
		);
		expect(createTask).not.toHaveBeenCalled();
		expect(updateTask).not.toHaveBeenCalled();
		expect(out.applied.every((a) => a.skipped)).toBe(true);
	});
});
