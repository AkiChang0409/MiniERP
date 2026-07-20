import { describe, it, expect } from 'vitest';
import { describeCurrentContext } from '$platform/ai/orchestrator/current-context';

/**
 * P4.1 layer 1: route/context → a "current page" preamble so pronouns like
 * "this project" resolve to the entity the user is viewing.
 */
describe('describeCurrentContext', () => {
	it('parses a project id from the route', () => {
		const out = describeCurrentContext({ route: '/projects/rec123/tasks' });
		expect(out).toContain('Current project: id=rec123');
		expect(out).toContain('this project');
	});

	it('prefers explicit ids over the parsed route', () => {
		const out = describeCurrentContext({ route: '/projects/recFromRoute', projectId: 'recExplicit' });
		expect(out).toContain('Current project: id=recExplicit');
		// the project entity uses the explicit id, not the one parsed from the route
		expect(out).not.toContain('id=recFromRoute');
	});

	it('ignores non-id project route segments', () => {
		expect(describeCurrentContext({ route: '/projects/gantt' })).toBe(
			'The user is currently on page "/projects/gantt".'
		);
		expect(describeCurrentContext({ route: '/projects/new' })).not.toContain('Current project');
	});

	it('parses document + task routes', () => {
		expect(describeCurrentContext({ route: '/finance/inbox/doc9' })).toContain('Current document: id=doc9');
		expect(describeCurrentContext({ route: '/employee/workplace/task7' })).toContain('Current task: id=task7');
	});

	it('returns null when there is nothing to seed', () => {
		expect(describeCurrentContext(undefined)).toBeNull();
		expect(describeCurrentContext({})).toBeNull();
	});
});
