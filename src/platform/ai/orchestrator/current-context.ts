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
import type { ResolvedEntities } from './entity-resolver';

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

/** Entities derivable from the route context (page the user is on). */
export function extractRouteEntities(routeContext: RouteContext | undefined): ResolvedEntities {
	if (!routeContext) return {};
	const parsed = routeContext.route ? parseRoute(routeContext.route) : {};
	const out: ResolvedEntities = {};
	const projectId = routeContext.projectId ?? parsed.projectId;
	const taskId = routeContext.taskId ?? parsed.taskId;
	const documentId = routeContext.documentId ?? parsed.documentId;
	if (projectId) out.projectId = projectId;
	if (taskId) out.taskId = taskId;
	if (documentId) out.documentId = documentId;
	return out;
}

/**
 * Build a "current context" preamble from the route context (what the user is
 * looking at now) plus `remembered` entities from earlier in the conversation
 * (P4.2 pronoun continuity). Current-page entities win; remembered ones fill the
 * gaps and are labelled "recently discussed". Returns null when nothing to seed.
 */
export function describeCurrentContext(
	routeContext: RouteContext | undefined,
	remembered?: ResolvedEntities
): string | null {
	const current = extractRouteEntities(routeContext);
	const lines: string[] = [];

	// Current-page entities.
	if (current.projectId) {
		lines.push(
			`Current project: id=${current.projectId} — if the user says "this project" / "当前项目" / "这个项目", it refers to this id.`
		);
	}
	if (current.taskId) lines.push(`Current task: id=${current.taskId} — "this task" / "当前任务" refers to this id.`);
	if (current.documentId) lines.push(`Current document: id=${current.documentId} — "this document" refers to this id.`);

	// Remembered entities (fill gaps only) — "this/that X" likely refers to them.
	if (remembered) {
		const remembers: Array<[keyof ResolvedEntities, string]> = [
			['projectId', 'project'],
			['taskId', 'task'],
			['documentId', 'document'],
			['customerId', 'customer'],
			['supplierId', 'supplier'],
			['employeeId', 'employee']
		];
		for (const [key, label] of remembers) {
			const id = remembered[key];
			if (id && !current[key]) {
				lines.push(`Recently discussed ${label}: id=${id} — "this/that ${label}" likely refers to this id.`);
			}
		}
	}

	if (lines.length === 0) {
		return routeContext?.route ? `The user is currently on page "${routeContext.route}".` : null;
	}
	const where = routeContext?.route ? `The user is on page "${routeContext.route}".\n` : '';
	return `CURRENT CONTEXT (what the user is looking at / recently discussed):\n${where}${lines.join('\n')}`;
}
