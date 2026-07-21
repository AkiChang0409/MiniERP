import { describe, it, expect } from 'vitest';
import {
	describeCurrentContext,
	extractRouteEntities
} from '$platform/ai/orchestrator/current-context';

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

	it('falls back to remembered entities when the route has none (P4.2)', () => {
		const out = describeCurrentContext({}, { projectId: 'recMem', customerId: 'recCust' });
		expect(out).toContain('Recently discussed project: id=recMem');
		expect(out).toContain('Recently discussed customer: id=recCust');
	});

	it('current-page entity wins over a remembered one of the same kind', () => {
		const out = describeCurrentContext({ route: '/projects/recNow' }, { projectId: 'recOld' });
		expect(out).toContain('Current project: id=recNow');
		expect(out).not.toContain('recOld');
	});

	it('extractRouteEntities pulls project/task/document ids', () => {
		expect(extractRouteEntities({ route: '/projects/recP/tasks' })).toEqual({ projectId: 'recP' });
		expect(extractRouteEntities({ documentId: 'd1' })).toEqual({ documentId: 'd1' });
		expect(extractRouteEntities(undefined)).toEqual({});
	});
});
