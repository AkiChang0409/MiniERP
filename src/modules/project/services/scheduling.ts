/**
 * Project scheduling engine (Gantt optimization P2).
 *
 * Pure, dependency-free functions so they can be unit-tested in isolation and
 * reused by the service layer. Two responsibilities:
 *
 *   1. computeSchedule() — a full Critical Path Method (CPM) pass over the task
 *      dependency network: forward pass → earliest start/finish, backward pass
 *      → latest start/finish, then total float (totalSlack) and free float
 *      (freeSlack). Tasks with zero total float form the critical path. All four
 *      relationship kinds (FS/SS/FF/SF) and per-edge lag are honoured.
 *
 *      The schedule works in *relative day units* (durations), not calendar
 *      dates — slack is a network property ("how many days can this slip before
 *      it delays a successor / the project"), independent of where the bars sit
 *      on the calendar. This matches the manual-scheduling model: we never move
 *      the user's dates, we only tell them how much room they have.
 *
 *   2. detectConflicts() — uses the *actual* manual calendar dates to surface
 *      problems the user should resolve: dependency constraints that the current
 *      placement violates, and the same assignee double-booked on overlapping
 *      tasks.
 */

const DAY = 86_400_000;

export type DependencyKind = 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish';

export interface SchedTask {
	id: string;
	name?: string;
	status?: string | null;
	startDate?: string | null;
	endDate?: string | null;
	assigneeId?: string | null;
	assigneeName?: string | null;
	estimatedHours?: number | null;
}

export interface SchedDep {
	id: string;
	fromTaskId: string;
	toTaskId: string;
	kind?: DependencyKind | string | null;
	lagDays?: number | null;
	isBlocking?: boolean | null;
}

export interface TaskSchedule {
	taskId: string;
	durationDays: number;
	earlyStart: number;
	earlyFinish: number;
	lateStart: number;
	lateFinish: number;
	/** Days the task can slip without delaying the project end. */
	totalSlack: number;
	/** Days the task can slip without delaying ANY successor's early start. */
	freeSlack: number;
	critical: boolean;
}

export interface ScheduleResult {
	bySchedule: Record<string, TaskSchedule>;
	criticalPath: string[];
	projectDurationDays: number;
}

export type Conflict =
	| {
			type: 'dependency';
			depId: string;
			fromTaskId: string;
			toTaskId: string;
			kind: string;
			message: string;
	  }
	| {
			type: 'resource';
			assigneeId: string;
			assigneeName: string | null;
			taskIds: string[];
			message: string;
	  };

function parseDay(iso: string | null | undefined): number | null {
	if (!iso) return null;
	const t = Date.parse(iso);
	return Number.isNaN(t) ? null : Math.round(t / DAY);
}

/** Duration in whole days: from dates when present, else estimatedHours/8, else 1. */
export function durationDays(t: SchedTask): number {
	const s = parseDay(t.startDate);
	const e = parseDay(t.endDate);
	if (s != null && e != null) return Math.max(1, e - s + 1);
	if (t.estimatedHours && t.estimatedHours > 0) return Math.max(1, Math.ceil(t.estimatedHours / 8));
	return 1;
}

const isBlocking = (d: SchedDep) => d.isBlocking !== false;
const kindOf = (d: SchedDep): DependencyKind =>
	(d.kind as DependencyKind) ?? 'finish_to_start';

/**
 * Topological order of task ids over the blocking-dependency DAG (Kahn's
 * algorithm). Nodes that remain in a cycle are appended at the end so the
 * passes still terminate (their slack will just be approximate).
 */
function topoOrder(taskIds: string[], edges: SchedDep[]): string[] {
	const indeg = new Map<string, number>();
	const adj = new Map<string, string[]>();
	for (const id of taskIds) {
		indeg.set(id, 0);
		adj.set(id, []);
	}
	for (const e of edges) {
		if (!indeg.has(e.fromTaskId) || !indeg.has(e.toTaskId)) continue;
		adj.get(e.fromTaskId)!.push(e.toTaskId);
		indeg.set(e.toTaskId, (indeg.get(e.toTaskId) ?? 0) + 1);
	}
	const queue = taskIds.filter((id) => (indeg.get(id) ?? 0) === 0);
	const order: string[] = [];
	while (queue.length) {
		const n = queue.shift()!;
		order.push(n);
		for (const m of adj.get(n) ?? []) {
			indeg.set(m, (indeg.get(m) ?? 0) - 1);
			if ((indeg.get(m) ?? 0) === 0) queue.push(m);
		}
	}
	// Append any cycle remnants so downstream code still sees every node.
	if (order.length < taskIds.length) {
		const seen = new Set(order);
		for (const id of taskIds) if (!seen.has(id)) order.push(id);
	}
	return order;
}

export function computeSchedule(tasks: SchedTask[], deps: SchedDep[]): ScheduleResult {
	const bySchedule: Record<string, TaskSchedule> = {};
	if (tasks.length === 0) return { bySchedule, criticalPath: [], projectDurationDays: 0 };

	const ids = tasks.map((t) => t.id);
	const dur = new Map<string, number>();
	for (const t of tasks) dur.set(t.id, durationDays(t));

	const edges = deps.filter((d) => isBlocking(d) && dur.has(d.fromTaskId) && dur.has(d.toTaskId));
	const preds = new Map<string, SchedDep[]>();
	const succs = new Map<string, SchedDep[]>();
	for (const id of ids) {
		preds.set(id, []);
		succs.set(id, []);
	}
	for (const e of edges) {
		succs.get(e.fromTaskId)!.push(e);
		preds.get(e.toTaskId)!.push(e);
	}

	const order = topoOrder(ids, edges);
	const ES = new Map<string, number>();
	const EF = new Map<string, number>();
	for (const id of ids) {
		ES.set(id, 0);
		EF.set(id, dur.get(id)!);
	}

	// Forward pass: earliest start/finish honouring each relationship kind+lag.
	for (const j of order) {
		let es = 0;
		for (const e of preds.get(j) ?? []) {
			const i = e.fromTaskId;
			const lag = e.lagDays ?? 0;
			const di = dur.get(i)!;
			const dj = dur.get(j)!;
			const esi = ES.get(i)!;
			let req: number;
			switch (kindOf(e)) {
				case 'start_to_start':
					req = esi + lag;
					break;
				case 'finish_to_finish':
					req = esi + di + lag - dj;
					break;
				case 'start_to_finish':
					req = esi + lag - dj;
					break;
				case 'finish_to_start':
				default:
					req = esi + di + lag;
					break;
			}
			es = Math.max(es, req);
		}
		ES.set(j, es);
		EF.set(j, es + dur.get(j)!);
	}

	const projectDur = Math.max(...ids.map((id) => EF.get(id)!), 0);

	// Backward pass: latest finish/start. Sinks default to project end.
	const LF = new Map<string, number>();
	const LS = new Map<string, number>();
	for (const id of ids) {
		LF.set(id, projectDur);
		LS.set(id, projectDur - dur.get(id)!);
	}
	for (let k = order.length - 1; k >= 0; k--) {
		const i = order[k];
		const di = dur.get(i)!;
		let lf = projectDur;
		for (const e of succs.get(i) ?? []) {
			const j = e.toTaskId;
			const lag = e.lagDays ?? 0;
			const dj = dur.get(j)!;
			const lsj = LS.get(j)!;
			const lfj = LF.get(j)!;
			let cap: number; // upper bound for LF_i
			switch (kindOf(e)) {
				case 'start_to_start':
					cap = lsj - lag + di;
					break;
				case 'finish_to_finish':
					cap = lfj - lag;
					break;
				case 'start_to_finish':
					cap = lfj - lag + di - dj; // EF_j>=ES_i+lag → ES_i<=EF_j-lag
					break;
				case 'finish_to_start':
				default:
					cap = lsj - lag;
					break;
			}
			lf = Math.min(lf, cap);
		}
		LF.set(i, lf);
		LS.set(i, lf - di);
	}

	for (const id of ids) {
		const totalSlack = LS.get(id)! - ES.get(id)!;
		// Free slack: room before the earliest start of any successor.
		let freeSlack = Infinity;
		const out = succs.get(id) ?? [];
		if (out.length === 0) {
			freeSlack = projectDur - EF.get(id)!;
		} else {
			for (const e of out) {
				const j = e.toTaskId;
				const lag = e.lagDays ?? 0;
				const di = dur.get(id)!;
				const dj = dur.get(j)!;
				const esi = ES.get(id)!;
				const esj = ES.get(j)!;
				let slackToJ: number;
				switch (kindOf(e)) {
					case 'start_to_start':
						slackToJ = esj - (esi + lag);
						break;
					case 'finish_to_finish':
						slackToJ = esj + dj - (esi + di + lag);
						break;
					case 'start_to_finish':
						slackToJ = esj + dj - (esi + lag);
						break;
					case 'finish_to_start':
					default:
						slackToJ = esj - (esi + di + lag);
						break;
				}
				freeSlack = Math.min(freeSlack, slackToJ);
			}
		}
		if (!Number.isFinite(freeSlack)) freeSlack = 0;
		bySchedule[id] = {
			taskId: id,
			durationDays: dur.get(id)!,
			earlyStart: ES.get(id)!,
			earlyFinish: EF.get(id)!,
			lateStart: LS.get(id)!,
			lateFinish: LF.get(id)!,
			totalSlack,
			freeSlack: Math.max(0, freeSlack),
			critical: totalSlack <= 0
		};
	}

	const criticalPath = ids
		.filter((id) => bySchedule[id].critical)
		.sort((a, b) => bySchedule[a].earlyStart - bySchedule[b].earlyStart);

	return { bySchedule, criticalPath, projectDurationDays: projectDur };
}

/**
 * Conflicts derived from the *actual* manual placement (not the network model).
 */
export function detectConflicts(tasks: SchedTask[], deps: SchedDep[]): Conflict[] {
	const conflicts: Conflict[] = [];
	const byId = new Map(tasks.map((t) => [t.id, t]));

	// --- Dependency constraint violations ---------------------------------
	for (const d of deps) {
		if (!isBlocking(d)) continue;
		const from = byId.get(d.fromTaskId);
		const to = byId.get(d.toTaskId);
		if (!from || !to) continue;
		const fs = parseDay(from.startDate);
		const fe = parseDay(from.endDate);
		const ts = parseDay(to.startDate);
		const te = parseDay(to.endDate);
		const lag = d.lagDays ?? 0;
		let violated = false;
		switch (kindOf(d)) {
			case 'start_to_start':
				if (fs != null && ts != null && ts < fs + lag) violated = true;
				break;
			case 'finish_to_finish':
				if (fe != null && te != null && te < fe + lag) violated = true;
				break;
			case 'start_to_finish':
				if (fs != null && te != null && te < fs + lag) violated = true;
				break;
			case 'finish_to_start':
			default:
				// successor must start at least `lag` days after predecessor finishes
				if (fe != null && ts != null && ts < fe + 1 + lag) violated = true;
				break;
		}
		if (violated) {
			conflicts.push({
				type: 'dependency',
				depId: d.id,
				fromTaskId: d.fromTaskId,
				toTaskId: d.toTaskId,
				kind: kindOf(d),
				message: `"${to.name ?? 'task'}" is scheduled before its prerequisite "${from.name ?? 'task'}" allows (${kindOf(d).replace(/_/g, '-')}${lag ? `, lag ${lag}d` : ''}).`
			});
		}
	}

	// --- Resource over-allocation (same assignee, overlapping windows) -----
	const byAssignee = new Map<string, SchedTask[]>();
	for (const t of tasks) {
		if (!t.assigneeId) continue;
		if (t.status === 'completed') continue;
		if (parseDay(t.startDate) == null || parseDay(t.endDate) == null) continue;
		const arr = byAssignee.get(t.assigneeId) ?? [];
		arr.push(t);
		byAssignee.set(t.assigneeId, arr);
	}
	for (const [assigneeId, arr] of byAssignee) {
		if (arr.length < 2) continue;
		const sorted = [...arr].sort((a, b) => parseDay(a.startDate)! - parseDay(b.startDate)!);
		const overlapping = new Set<string>();
		for (let i = 0; i < sorted.length; i++) {
			for (let j = i + 1; j < sorted.length; j++) {
				const aEnd = parseDay(sorted[i].endDate)!;
				const bStart = parseDay(sorted[j].startDate)!;
				if (bStart <= aEnd) {
					overlapping.add(sorted[i].id);
					overlapping.add(sorted[j].id);
				} else {
					break; // sorted by start; no later task can overlap this one
				}
			}
		}
		if (overlapping.size >= 2) {
			conflicts.push({
				type: 'resource',
				assigneeId,
				assigneeName: arr[0].assigneeName ?? null,
				taskIds: [...overlapping],
				message: `${arr[0].assigneeName ?? 'Assignee'} has ${overlapping.size} overlapping tasks.`
			});
		}
	}

	return conflicts;
}
