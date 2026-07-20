/**
 * Current-page context seeding (P4.1 layer 1).
 *
 * Turns the inbound `RouteContext` (the page/route the user is on + any explicit
 * entity ids the channel supplied) into a short natural-language preamble for the
 * unified agent loop, so pronouns like "this project" / "当前项目" resolve to the
 * entity the user is looking at — without the loop having to guess.
 *
 * Self-contained: it works off the `route` string alone (no frontend change
 * needed); explicit `routeContext.{projectId,taskId,documentId}` take precedence
 * when the channel provides them.
 */
import type { RouteContext } from './contracts';

/** Route segments under /projects/<seg> that are pages, not project ids. */
const PROJECT_NON_ID_SEGMENTS = new Set(['new', 'gantt', 'dashboard', 'calendar']);

function firstMatch(route: string, re: RegExp): string | null {
	const m = re.exec(route);
	return m?.[1] ?? null;
}

/** Best-effort parse of entity ids from a route path. */
function parseRoute(route: string): { projectId?: string; taskId?: string; documentId?: string } {
	const out: { projectId?: string; taskId?: string; documentId?: string } = {};

	const projectSeg = firstMatch(route, /\/projects\/([^/]+)/);
	if (projectSeg && !PROJECT_NON_ID_SEGMENTS.has(projectSeg)) out.projectId = projectSeg;

	const taskSeg = firstMatch(route, /\/workplace\/([^/]+)/);
	if (taskSeg) out.taskId = taskSeg;

	const docSeg = firstMatch(route, /\/finance\/inbox\/([^/]+)/);
	if (docSeg) out.documentId = docSeg;

	return out;
}

/**
 * Build a "current context" preamble from the route context, or null when there
 * is nothing to seed. Explicit ids on `routeContext` win over parsed ones.
 */
export function describeCurrentContext(routeContext: RouteContext | undefined): string | null {
	if (!routeContext) return null;
	const parsed = routeContext.route ? parseRoute(routeContext.route) : {};

	const projectId = routeContext.projectId ?? parsed.projectId;
	const taskId = routeContext.taskId ?? parsed.taskId;
	const documentId = routeContext.documentId ?? parsed.documentId;

	const lines: string[] = [];
	if (projectId) {
		lines.push(
			`Current project: id=${projectId} — if the user says "this project" / "current project" / "当前项目" / "这个项目", it refers to this id.`
		);
	}
	if (taskId) {
		lines.push(`Current task: id=${taskId} — "this task" / "当前任务" refers to this id.`);
	}
	if (documentId) {
		lines.push(`Current document: id=${documentId} — "this document" refers to this id.`);
	}
	if (lines.length === 0) {
		// No specific entity — still tell the model where the user is, if known.
		return routeContext.route ? `The user is currently on page "${routeContext.route}".` : null;
	}

	const where = routeContext.route ? `The user is on page "${routeContext.route}".\n` : '';
	return `CURRENT CONTEXT (what the user is looking at right now):\n${where}${lines.join('\n')}`;
}
