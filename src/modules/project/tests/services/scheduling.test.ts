import { describe, it, expect } from 'vitest';
import {
	computeSchedule,
	detectConflicts,
	durationDays,
	type SchedTask,
	type SchedDep
} from '../../services/scheduling';

const task = (id: string, start: string, end: string, extra: Partial<SchedTask> = {}): SchedTask => ({
	id,
	name: id,
	startDate: start,
	endDate: end,
	...extra
});
const fs = (id: string, from: string, to: string, lagDays = 0): SchedDep => ({
	id,
	fromTaskId: from,
	toTaskId: to,
	kind: 'finish_to_start',
	lagDays,
	isBlocking: true
});

describe('durationDays', () => {
	it('counts inclusive days from dates', () => {
		expect(durationDays(task('a', '2026-01-01', '2026-01-05'))).toBe(5);
	});
	it('falls back to estimatedHours/8 then 1', () => {
		expect(durationDays({ id: 'x', estimatedHours: 20 })).toBe(3);
		expect(durationDays({ id: 'y' })).toBe(1);
	});
});

describe('computeSchedule — linear chain', () => {
	it('makes the whole FS chain critical with zero slack', () => {
		const tasks = [
			task('A', '2026-01-01', '2026-01-05'),
			task('B', '2026-01-06', '2026-01-10'),
			task('C', '2026-01-11', '2026-01-15')
		];
		const deps = [fs('d1', 'A', 'B'), fs('d2', 'B', 'C')];
		const r = computeSchedule(tasks, deps);
		expect(r.projectDurationDays).toBe(15);
		expect(new Set(r.criticalPath)).toEqual(new Set(['A', 'B', 'C']));
		for (const id of ['A', 'B', 'C']) {
			expect(r.bySchedule[id].totalSlack).toBe(0);
			expect(r.bySchedule[id].critical).toBe(true);
		}
	});
});

describe('computeSchedule — diamond with a slack branch', () => {
	it('gives the short branch positive total + free slack', () => {
		const tasks = [
			task('A', '2026-01-01', '2026-01-02'), // dur 2
			task('B', '2026-01-03', '2026-01-07'), // dur 5 (long branch)
			task('C', '2026-01-03', '2026-01-04'), // dur 2 (short branch)
			task('D', '2026-01-08', '2026-01-09') // dur 2
		];
		const deps = [fs('1', 'A', 'B'), fs('2', 'A', 'C'), fs('3', 'B', 'D'), fs('4', 'C', 'D')];
		const r = computeSchedule(tasks, deps);
		expect(r.projectDurationDays).toBe(9);
		expect(new Set(r.criticalPath)).toEqual(new Set(['A', 'B', 'D']));
		expect(r.bySchedule['C'].critical).toBe(false);
		expect(r.bySchedule['C'].totalSlack).toBe(3);
		expect(r.bySchedule['C'].freeSlack).toBe(3);
		expect(r.bySchedule['B'].totalSlack).toBe(0);
	});
});

describe('detectConflicts — dependency violation', () => {
	it('flags a successor scheduled before its FS predecessor finishes', () => {
		const tasks = [
			task('A', '2026-01-01', '2026-01-05'),
			task('B', '2026-01-03', '2026-01-08') // starts before A ends → violation
		];
		const deps = [fs('d1', 'A', 'B')];
		const conflicts = detectConflicts(tasks, deps);
		const dep = conflicts.filter((c) => c.type === 'dependency');
		expect(dep).toHaveLength(1);
		expect(dep[0]).toMatchObject({ type: 'dependency', depId: 'd1', fromTaskId: 'A', toTaskId: 'B' });
	});

	it('does not flag a well-ordered chain', () => {
		const tasks = [task('A', '2026-01-01', '2026-01-05'), task('B', '2026-01-06', '2026-01-10')];
		const conflicts = detectConflicts(tasks, [fs('d1', 'A', 'B')]);
		expect(conflicts.filter((c) => c.type === 'dependency')).toHaveLength(0);
	});
});

describe('detectConflicts — resource over-allocation', () => {
	it('flags the same assignee on overlapping tasks', () => {
		const tasks = [
			task('X', '2026-01-01', '2026-01-10', { assigneeId: 'u1', assigneeName: 'Alice' }),
			task('Y', '2026-01-05', '2026-01-15', { assigneeId: 'u1', assigneeName: 'Alice' }),
			task('Z', '2026-02-01', '2026-02-05', { assigneeId: 'u1', assigneeName: 'Alice' })
		];
		const conflicts = detectConflicts(tasks, []);
		const res = conflicts.filter((c) => c.type === 'resource');
		expect(res).toHaveLength(1);
		if (res[0].type === 'resource') {
			expect(res[0].assigneeId).toBe('u1');
			expect(new Set(res[0].taskIds)).toEqual(new Set(['X', 'Y']));
		}
	});

	it('ignores completed tasks and non-overlapping windows', () => {
		const tasks = [
			task('X', '2026-01-01', '2026-01-10', { assigneeId: 'u1', status: 'completed' }),
			task('Y', '2026-01-05', '2026-01-15', { assigneeId: 'u1' })
		];
		expect(detectConflicts(tasks, []).filter((c) => c.type === 'resource')).toHaveLength(0);
	});
});
