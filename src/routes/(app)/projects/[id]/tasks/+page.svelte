<script lang="ts">
	import { computeUrgency } from '$modules/project';

	let { data } = $props();

	type Project = {
		id: string;
		name: string;
		status: string;
		startDate: string | null;
		endDate: string | null;
		deadline: string | null;
		createdAt: string;
	};

	// ----------------------------------------------------------------- types
	type Task = {
		id: string;
		projectId: string;
		parentTaskId: string | null;
		name: string;
		description: string | null;
		status: string;
		startDate: string | null;
		endDate: string | null;
		assigneeId: string | null;
		assigneeName: string | null;
		assigneeEmail: string | null;
		estimatedHours: number | null;
		orderIndex: number;
		isMilestone: boolean;
		workflowStageId: string | null;
		kind: 'task' | 'milestone' | 'buffer';
		baselineStart: string | null;
		baselineEnd: string | null;
		actualStart: string | null;
		progressPct: number | null;
		bufferDays: number | null;
		blockedReason: string | null;
		outsourcedPartnerId: string | null;
		subProjectId: string | null;
		taskType: string | null;
	};
	type Dep = {
		id: string;
		fromTaskId: string;
		toTaskId: string;
		kind: string;
		lagDays: number;
		isBlocking: boolean;
	};
	type Stage = { id: string; name: string; orderIndex: number; status: string; color: string | null };
	type User = { id: string; name: string | null; email: string };
	type Sched = { totalSlack: number; freeSlack: number; critical: boolean; durationDays: number };
	type Conflict =
		| { type: 'dependency'; depId: string; fromTaskId: string; toTaskId: string; kind: string; message: string }
		| { type: 'resource'; assigneeId: string; assigneeName: string | null; taskIds: string[]; message: string };

	const projectId = data.projectId;
	const project = $derived(data.project as Project | null);
	let projectExpanded = $state(true);

	// Local mutable state (optimistic). Re-hydrated from the server via refresh().
	let tasks = $state<Task[]>((data.tasks as Task[]) ?? []);
	let deps = $state<Dep[]>((data.dependencies as Dep[]) ?? []);
	let stages = $state<Stage[]>((data.stages as Stage[]) ?? []);
	let criticalPath = $state<Set<string>>(new Set((data.criticalPath as string[]) ?? []));
	let scheduleById = $state<Record<string, Sched>>((data.scheduleById as Record<string, Sched>) ?? {});
	let conflicts = $state<Conflict[]>((data.conflicts as Conflict[]) ?? []);
	const users = $derived((data.users as User[]) ?? []);

	// Task ids touched by any conflict → drives the red ring in the chart.
	const conflictedTaskIds = $derived.by(() => {
		const s = new Set<string>();
		for (const c of conflicts) {
			if (c.type === 'dependency') {
				s.add(c.fromTaskId);
				s.add(c.toTaskId);
			} else {
				for (const id of c.taskIds) s.add(id);
			}
		}
		return s;
	});

	// Per-assignee workload (P4): active (non-completed) task count + estimated
	// hours, flagged overloaded when they appear in a resource conflict.
	const workload = $derived.by(() => {
		const overloaded = new Set(
			conflicts.filter((c) => c.type === 'resource').map((c) => (c as { assigneeId: string }).assigneeId)
		);
		const map = new Map<string, { name: string; taskCount: number; hours: number; overloaded: boolean }>();
		for (const t of tasks) {
			if (!t.assigneeId || t.status === 'completed') continue;
			const slot =
				map.get(t.assigneeId) ??
				{ name: t.assigneeName ?? t.assigneeEmail ?? 'Unknown', taskCount: 0, hours: 0, overloaded: false };
			slot.taskCount += 1;
			slot.hours += t.estimatedHours ?? 0;
			map.set(t.assigneeId, slot);
		}
		return [...map.entries()]
			.map(([id, v]) => ({ id, ...v, overloaded: overloaded.has(id) }))
			.sort((a, b) => b.hours - a.hours || b.taskCount - a.taskCount);
	});

	// Re-hydrate local state whenever the server payload changes — navigating
	// between projects reuses this component, so without this the previous
	// project's tasks would linger. refresh() (after writes) mutates the local
	// copies only and never re-runs this effect, so optimistic edits survive.
	let hydratedFor = $state<string | null>(null);
	$effect(() => {
		if (hydratedFor === data.projectId) return;
		hydratedFor = data.projectId;
		tasks = (data.tasks as Task[]) ?? [];
		deps = (data.dependencies as Dep[]) ?? [];
		stages = (data.stages as Stage[]) ?? [];
		criticalPath = new Set((data.criticalPath as string[]) ?? []);
		scheduleById = (data.scheduleById as Record<string, Sched>) ?? {};
		conflicts = (data.conflicts as Conflict[]) ?? [];
	});

	async function refresh() {
		try {
			const [rosterRes, schedRes, stageRes]: [any, any, any] = await Promise.all([
				fetch(`/api/projects/${projectId}/tasks`).then((r) => r.json()),
				fetch(`/api/projects/${projectId}/schedule`).then((r) => r.json()),
				fetch(`/api/projects/${projectId}/stages`).then((r) => r.json())
			]);
			tasks = (rosterRes?.data?.tasks ?? rosterRes?.tasks ?? []) as Task[];
			deps = (rosterRes?.data?.dependencies ?? rosterRes?.dependencies ?? []) as Dep[];
			stages = (stageRes?.data?.stages ?? stageRes?.stages ?? []) as Stage[];
			const sched = schedRes?.data ?? schedRes ?? {};
			criticalPath = new Set((sched.criticalPath ?? []) as string[]);
			conflicts = (sched.conflicts ?? []) as Conflict[];
			scheduleById = Object.fromEntries(
				((sched.tasks ?? []) as Array<{ id: string; schedule: Sched | null }>).map((t) => [t.id, t.schedule])
			) as Record<string, Sched>;
		} catch {
			/* leave current state; next action retries */
		}
	}

	// --------------------------------------------------------------- timeline
	type Scale = 'day' | 'week' | 'month';
	let scale = $state<Scale>('week');
	const PX_PER_DAY: Record<Scale, number> = { day: 30, week: 11, month: 4 };
	const pxPerDay = $derived(PX_PER_DAY[scale]);

	const ONE_DAY = 86_400_000;
	const parse = (iso: string | null | undefined) => {
		if (!iso) return null;
		const t = Date.parse(iso);
		if (Number.isNaN(t)) return null;
		const d = new Date(t);
		return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
	};
	const todayStart = () => {
		const d = new Date();
		return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
	};

	// Window = min(start/baseline) - 7d .. max(end/baseline) + 14d, padded.
	const windowMs = $derived.by(() => {
		let lo = Infinity;
		let hi = -Infinity;
		// Anchor on the project's own window first so the chart frame is visible
		// even before any tasks exist.
		if (project) {
			for (const v of [project.startDate, project.createdAt]) {
				const p = parse(v);
				if (p != null) lo = Math.min(lo, p);
			}
			for (const v of [project.deadline, project.endDate]) {
				const p = parse(v);
				if (p != null) hi = Math.max(hi, p);
			}
		}
		for (const t of tasks) {
			for (const v of [t.startDate, t.baselineStart, t.actualStart]) {
				const p = parse(v);
				if (p != null) lo = Math.min(lo, p);
			}
			for (const v of [t.endDate, t.baselineEnd]) {
				const p = parse(v);
				if (p != null) hi = Math.max(hi, p);
			}
		}
		const today = todayStart();
		if (lo === Infinity) lo = today - 30 * ONE_DAY;
		if (hi === -Infinity) hi = today + 90 * ONE_DAY;
		lo = Math.min(lo, today);
		hi = Math.max(hi, today);
		return { from: lo - 7 * ONE_DAY, to: hi + 14 * ONE_DAY };
	});
	const rangeDays = $derived(Math.max(1, Math.round((windowMs.to - windowMs.from) / ONE_DAY) + 1));
	const chartWidth = $derived(Math.max(480, rangeDays * pxPerDay));

	const dayOffset = (iso: string | null) => {
		const t = parse(iso);
		if (t == null) return 0;
		return Math.round((t - windowMs.from) / ONE_DAY);
	};
	const inclusiveDayWidth = (startIso: string | null, endIso: string | null) => {
		return Math.max(1, dayOffset(endIso) - dayOffset(startIso) + 1);
	};
	const todayX = $derived((Math.round((todayStart() - windowMs.from) / ONE_DAY)) * pxPerDay);

	const TICK_HEIGHT = 36;
	const ROW_HEIGHT = 36;
	const BAR_HEIGHT = 15;

	const ticks = $derived.by(() => {
		const out: Array<{ x: number; label: string; major: boolean }> = [];
		const start = new Date(windowMs.from);
		const end = new Date(windowMs.to);
		if (scale === 'month') {
			const cur = new Date(start);
			cur.setDate(1);
			while (cur.getTime() <= end.getTime()) {
				const off = Math.round((cur.getTime() - windowMs.from) / ONE_DAY);
				out.push({
					x: off * pxPerDay,
					label: cur.toLocaleString('en-SG', { month: 'short', year: '2-digit' }),
					major: cur.getMonth() === 0
				});
				cur.setMonth(cur.getMonth() + 1);
			}
		} else {
			// Day / week scale: walk day by day, emit a major tick on the 1st of
			// each month and a minor tick on Mondays (every day in day-scale).
			const cur = new Date(start);
			while (cur.getTime() <= end.getTime()) {
				const off = Math.round((cur.getTime() - windowMs.from) / ONE_DAY);
				const monthStart = cur.getDate() === 1;
				const mondayStart = cur.getDay() === 1;
				if (monthStart || mondayStart || scale === 'day') {
					out.push({
						x: off * pxPerDay,
						label: monthStart ? cur.toLocaleString('en-SG', { month: 'short' }) : `${cur.getDate()}`,
						major: monthStart
					});
				}
				cur.setDate(cur.getDate() + 1);
			}
		}
		return out;
	});

	// --------------------------------------------------------------- views
	// Two ways to read the same data: group rows by stage (schedule view, keeps
	// dependencies + critical path) or by assignee (resource view, shows who is
	// doing what and who is over-allocated).
	let viewMode = $state<'stage' | 'assignee'>('stage');

	let collapsed = $state<Set<string>>(new Set());
	function toggleLane(id: string) {
		const next = new Set(collapsed);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		collapsed = next;
	}

	const sortTasks = (arr: Task[]) =>
		[...arr].sort(
			(a, b) =>
				a.orderIndex - b.orderIndex || (parse(a.startDate) ?? 0) - (parse(b.startDate) ?? 0)
		);

	type Group = { id: string; label: string; color: string | null; tasks: Task[] };
	type StageRange = { id: string; label: string; color: string; startDay: number; endDay: number };
	const fallbackStageColors = ['#387234', '#0284c7', '#d97706', '#7c3aed', '#be123c', '#0f766e'];
	const groups = $derived.by<Group[]>(() => {
		if (viewMode === 'assignee') {
			const byUser = new Map<string, Task[]>();
			const unassigned: Task[] = [];
			for (const t of tasks) {
				if (t.assigneeId) {
					const arr = byUser.get(t.assigneeId) ?? [];
					arr.push(t);
					byUser.set(t.assigneeId, arr);
				} else {
					unassigned.push(t);
				}
			}
			const out: Group[] = [...byUser.entries()].map(([uid, ts]) => ({
				id: `u:${uid}`,
				label: ts[0].assigneeName ?? ts[0].assigneeEmail ?? uid,
				color: null,
				tasks: sortTasks(ts)
			}));
			out.sort((a, b) => a.label.localeCompare(b.label));
			out.push({ id: '__unassigned__', label: 'Unassigned', color: null, tasks: sortTasks(unassigned) });
			return out;
		}
		// stage mode
		const stageIds = new Set(stages.map((s) => s.id));
		const byStage = new Map<string, Task[]>();
		const backlog: Task[] = [];
		for (const t of tasks) {
			if (t.workflowStageId && stageIds.has(t.workflowStageId)) {
				const arr = byStage.get(t.workflowStageId) ?? [];
				arr.push(t);
				byStage.set(t.workflowStageId, arr);
			} else {
				backlog.push(t);
			}
		}
		const out: Group[] = [];
		for (const s of [...stages].sort((a, b) => a.orderIndex - b.orderIndex)) {
			out.push({ id: s.id, label: s.name, color: s.color, tasks: sortTasks(byStage.get(s.id) ?? []) });
		}
		out.push({ id: '__backlog__', label: 'Backlog (no stage)', color: null, tasks: sortTasks(backlog) });
		return out;
	});

	// Greedy interval packing: non-overlapping tasks share one track row; an
	// overlap forces a new sub-row (so resource over-allocation is visible).
	function packTracks(ts: Task[]): Task[][] {
		const sorted = sortTasks(ts);
		const trackEnds: number[] = [];
		const trackTasks: Task[][] = [];
		for (const t of sorted) {
			const s = parse(t.startDate) ?? 0;
			const e = parse(t.endDate) ?? s;
			let placed = false;
			for (let i = 0; i < trackTasks.length; i++) {
				if (s > trackEnds[i]) {
					trackTasks[i].push(t);
					trackEnds[i] = e;
					placed = true;
					break;
				}
			}
			if (!placed) {
				trackTasks.push([t]);
				trackEnds.push(e);
			}
		}
		return trackTasks;
	}

	// Flat row geometry: project summary → group headers → track rows. A track
	// holds 1 task in stage view, or 1+ packed tasks in assignee view.
	type Row =
		| { kind: 'project'; y: number }
		| { kind: 'group'; y: number; group: Group }
		| { kind: 'track'; y: number; group: Group; tasks: Task[]; single: Task | null };
	const rows = $derived.by<Row[]>(() => {
		const out: Row[] = [];
		let y = TICK_HEIGHT;
		out.push({ kind: 'project', y });
		y += ROW_HEIGHT;
		if (projectExpanded) {
			for (const group of groups) {
				out.push({ kind: 'group', y, group });
				y += ROW_HEIGHT;
				if (!collapsed.has(group.id)) {
					const tracks =
						viewMode === 'assignee' ? packTracks(group.tasks) : group.tasks.map((t) => [t]);
					// Always keep one (possibly empty) track row so the lane has a
					// draggable empty strip for drag-to-create.
					const list = tracks.length ? tracks : [[] as Task[]];
					for (const tt of list) {
						out.push({ kind: 'track', y, group, tasks: tt, single: tt.length === 1 ? tt[0] : null });
						y += ROW_HEIGHT;
					}
				}
			}
		}
		return out;
	});

	const stageRanges = $derived.by<StageRange[]>(() => {
		const byId = new Map(
			stages.map((s, i) => [
				s.id,
				{ stage: s, fallback: fallbackStageColors[i % fallbackStageColors.length] }
			])
		);
		const bounds = new Map<string, { start: number; end: number }>();
		for (const t of tasks) {
			if (!t.workflowStageId || !byId.has(t.workflowStageId) || !t.startDate || !t.endDate) continue;
			const start = dayOffset(t.startDate);
			const end = dayOffset(t.endDate);
			const prev = bounds.get(t.workflowStageId);
			bounds.set(t.workflowStageId, {
				start: prev ? Math.min(prev.start, start) : start,
				end: prev ? Math.max(prev.end, end) : end
			});
		}
		return [...bounds.entries()]
			.map(([id, bound]) => {
				const meta = byId.get(id)!;
				return {
					id,
					label: meta.stage.name,
					color: meta.stage.color ?? meta.fallback,
					startDay: bound.start,
					endDay: bound.end
				};
			})
			.sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay);
	});

	// Project summary bar geometry + overall completion.
	const projectBar = $derived.by(() => {
		if (!project) return null;
		const startDay = dayOffset(project.startDate ?? project.createdAt);
		const endDay = dayOffset(project.deadline ?? project.endDate);
		const urg = computeUrgency({
			status: project.status,
			startDate: project.startDate,
			deadline: project.deadline,
			createdAt: project.createdAt
		});
		const total = tasks.length;
		const done = tasks.filter((t) => t.status === 'completed').length;
		const pct = total > 0 ? Math.round((done / total) * 100) : 0;
		return {
			startDay,
			endDay,
			widthDays: inclusiveDayWidth(project.startDate ?? project.createdAt, project.deadline ?? project.endDate),
			urg,
			pct,
			total,
			done
		};
	});
	const chartHeight = $derived(
		rows.length === 0 ? TICK_HEIGHT + ROW_HEIGHT : rows[rows.length - 1].y + ROW_HEIGHT
	);
	const taskY = $derived.by<Record<string, number>>(() => {
		const m: Record<string, number> = {};
		for (const r of rows) if (r.kind === 'track') for (const t of r.tasks) m[t.id] = r.y;
		return m;
	});

	// --------------------------------------------------------------- colours
	function statusColor(t: Task): { bar: string; fill: string; text: string; border: string } {
		switch (t.status) {
			case 'completed':
				return { bar: '#bbf7d0', fill: '#16a34a', text: '#166534', border: '#86efac' };
			case 'blocked':
				return { bar: '#fecaca', fill: '#dc2626', text: '#991b1b', border: '#fca5a5' };
			case 'under_review':
				return { bar: '#fde68a', fill: '#f59e0b', text: '#92400e', border: '#fcd34d' };
			case 'ongoing':
				return { bar: '#bae6fd', fill: '#0284c7', text: '#075985', border: '#7dd3fc' };
			default:
				return { bar: '#e2e8f0', fill: '#94a3b8', text: '#475569', border: '#cbd5e1' };
		}
	}
	function progressOf(t: Task): number {
		if (t.progressPct != null) return Math.max(0, Math.min(100, t.progressPct));
		if (t.status === 'completed') return 100;
		if (t.status === 'ongoing' || t.status === 'under_review') return 40;
		return 0;
	}

	// --------------------------------------------------------------- drag
	type DragState = {
		taskId: string;
		mode: 'move' | 'resize-left' | 'resize-right';
		startX: number;
		originalStart: number;
		originalEnd: number;
	} | null;
	let drag = $state<DragState>(null);
	let dragDeltaDays = $state(0);

	function beginDrag(e: PointerEvent, mode: 'move' | 'resize-left' | 'resize-right', t: Task) {
		if (!t.startDate || !t.endDate) return;
		e.preventDefault();
		e.stopPropagation();
		(e.currentTarget as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(
			e.pointerId
		);
		drag = {
			taskId: t.id,
			mode,
			startX: e.clientX,
			originalStart: Date.parse(t.startDate),
			originalEnd: Date.parse(t.endDate)
		};
		dragDeltaDays = 0;
	}
	// Resolved start/end while dragging a bar (also feeds the live tooltip).
	function dragDates(d: NonNullable<DragState>, days: number) {
		let ns = d.originalStart;
		let ne = d.originalEnd;
		if (d.mode === 'move') {
			ns += days * ONE_DAY;
			ne += days * ONE_DAY;
		} else if (d.mode === 'resize-left') {
			ns += days * ONE_DAY;
			if (ns >= ne) ns = ne - ONE_DAY;
		} else {
			ne += days * ONE_DAY;
			if (ne <= ns) ne = ns + ONE_DAY;
		}
		return { ns, ne };
	}
	const dragPreview = $derived.by(() => {
		if (!drag) return null;
		const { ns, ne } = dragDates(drag, dragDeltaDays);
		return {
			start: new Date(ns).toISOString().slice(0, 10),
			end: new Date(ne).toISOString().slice(0, 10),
			dur: Math.round((ne - ns) / ONE_DAY) + 1
		};
	});

	// Drag-to-create on an empty timeline strip.
	type CreateDrag = { group: Group; y: number; originLeft: number; startDay: number; curDay: number } | null;
	let createDrag = $state<CreateDrag>(null);
	function beginCreateDrag(e: PointerEvent, group: Group, rowY: number) {
		if (e.button !== 0) return;
		e.preventDefault();
		const rect = (e.currentTarget as Element).getBoundingClientRect();
		(e.currentTarget as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(
			e.pointerId
		);
		const day = Math.floor((e.clientX - rect.left) / pxPerDay);
		createDrag = { group, y: rowY, originLeft: rect.left, startDay: day, curDay: day };
	}

	function onPointerMove(e: PointerEvent) {
		if (drag) {
			dragDeltaDays = Math.round((e.clientX - drag.startX) / pxPerDay);
		} else if (createDrag) {
			createDrag = {
				...createDrag,
				curDay: Math.floor((e.clientX - createDrag.originLeft) / pxPerDay)
			};
		}
	}
	async function onPointerUp() {
		if (createDrag) {
			const cd = createDrag;
			createDrag = null;
			const lo = Math.min(cd.startDay, cd.curDay);
			const hi = Math.max(cd.startDay, cd.curDay);
			if (hi > lo) {
				const startIso = new Date(windowMs.from + lo * ONE_DAY).toISOString().slice(0, 10);
				const endIso = new Date(windowMs.from + hi * ONE_DAY).toISOString().slice(0, 10);
				const preset: Partial<Editor> = { startDate: startIso, endDate: endIso };
				if (viewMode === 'assignee') {
					if (cd.group.id.startsWith('u:')) preset.assigneeId = cd.group.id.slice(2);
				} else if (cd.group.id !== '__backlog__') {
					preset.workflowStageId = cd.group.id;
				}
				openCreatePreset(preset);
			}
			return;
		}
		if (!drag) return;
		const days = dragDeltaDays;
		const d = drag;
		drag = null;
		dragDeltaDays = 0;
		// A pointerup with no movement on the bar body = a click → open editor.
		if (days === 0) {
			if (d.mode === 'move') {
				const t = tasks.find((x) => x.id === d.taskId);
				if (t) openEdit(t);
			}
			return;
		}
		const { ns, ne } = dragDates(d, days);
		const startIso = new Date(ns).toISOString().slice(0, 10);
		const endIso = new Date(ne).toISOString().slice(0, 10);
		// optimistic
		tasks = tasks.map((t) => (t.id === d.taskId ? { ...t, startDate: startIso, endDate: endIso } : t));
		await fetch(`/api/projects/${projectId}/tasks/${d.taskId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ startDate: startIso, endDate: endIso })
		});
		await refresh();
	}

	// --------------------------------------------------------------- editor
	type Editor = {
		open: boolean;
		mode: 'create' | 'edit';
		id: string | null;
		name: string;
		description: string;
		status: string;
		kind: 'task' | 'milestone' | 'buffer';
		startDate: string;
		endDate: string;
		assigneeId: string;
		estimatedHours: string;
		progressPct: string;
		bufferDays: string;
		blockedReason: string;
		workflowStageId: string;
		parentTaskId: string;
		rescheduleReason: string;
		outsourcedPartnerId: string;
		subProjectId: string;
		taskType: string;
	};
	type HistoryRow = {
		id: string;
		eventType: string;
		oldStart: string | null;
		oldEnd: string | null;
		newStart: string | null;
		newEnd: string | null;
		reason: string | null;
		createdAt: string;
	};
	const blankEditor = (preset?: Partial<Editor>): Editor => ({
		open: true,
		mode: 'create',
		id: null,
		name: '',
		description: '',
		status: 'unassigned',
		kind: 'task',
		startDate: '',
		endDate: '',
		assigneeId: '',
		estimatedHours: '',
		progressPct: '',
		bufferDays: '0',
		blockedReason: '',
		workflowStageId: '',
		parentTaskId: '',
		rescheduleReason: '',
		outsourcedPartnerId: '',
		subProjectId: '',
		taskType: '',
		...preset
	});
	let editor = $state<Editor | null>(null);
	let saving = $state(false);
	let editorError = $state<string | null>(null);
	let taskHistory = $state<HistoryRow[]>([]);

	// Outsourcing pickers (P4): partners loaded lazily, sub-projects from loader.
	let partners = $state<Array<{ id: string; name: string }>>([]);
	const subProjects = $derived(
		(data.subProjects as Array<{ id: string; name: string }>) ?? []
	);
	async function ensurePartners() {
		if (partners.length > 0) return;
		try {
			const res: any = await fetch('/api/sales-crm/customers').then((r) => r.json());
			const list = (res?.data ?? res ?? []) as Array<{ id: string; name: string }>;
			partners = list.map((p) => ({ id: p.id, name: p.name }));
		} catch {
			/* leave empty */
		}
	}

	async function loadHistory(taskId: string) {
		taskHistory = [];
		try {
			const res: any = await fetch(`/api/projects/${projectId}/tasks/${taskId}/history`).then((r) => r.json());
			taskHistory = ((res?.data?.changes ?? res?.changes ?? []) as HistoryRow[]);
		} catch {
			/* leave empty */
		}
	}

	// ---------------------------------------------------------------- ISO 9001 QMS
	const TASK_TYPES: Array<{ value: string; label: string }> = [
		{ value: '', label: '— 无 —' },
		{ value: 'design', label: '设计开发 Design' },
		{ value: 'procurement', label: '采购 Procurement' },
		{ value: 'production', label: '生产装配 Production' },
		{ value: 'software', label: '软件/AI Software' },
		{ value: 'sales', label: '销售/项目 Sales' },
		{ value: 'inspection', label: '检验 Inspection' },
		{ value: 'document_control', label: '文控 Doc Control' },
		{ value: 'quality', label: '质量问题 Quality' },
		{ value: 'handover', label: '交付 Handover' },
		{ value: 'general', label: '通用 General' }
	];
	type QmsTemplate = {
		id: string;
		code: string;
		name: string;
		scope: string;
		taskType: string | null;
		responsibleRole: string | null;
		requiresApproval: boolean;
		isActive: boolean;
		moduleCategory: string | null;
	};
	type QmsRecord = {
		id: string;
		templateId: string;
		code: string | null;
		name: string;
		status: string;
		responsibleUserId: string | null;
		responsibleName: string | null;
		responsibleEmail: string | null;
		responsibleRole: string | null;
		isRequired: boolean;
		requiresApproval: boolean;
		version: number;
		rejectedReason: string | null;
		fileUrl: string | null;
	};

	// Current viewer (from the app layout) — gates the approve/reject/waive controls.
	const currentUser = $derived(
		(data.user as { id: string; roles?: string[] } | null | undefined) ?? null
	);
	const canManage = $derived.by(() => {
		const u = currentUser;
		if (!u) return false;
		const roles = u.roles ?? [];
		if (roles.some((r) => r === 'owner' || r === 'admin' || r === 'project_manager')) return true;
		return (data.project as { ownerId?: string } | null)?.ownerId === u.id;
	});

	let allTemplates = $state<QmsTemplate[]>([]);
	let qmsRecords = $state<QmsRecord[]>([]);
	let qmsBusy = $state(false);

	async function ensureTemplates() {
		if (allTemplates.length > 0) return;
		try {
			const res: any = await fetch('/api/qms/templates').then((r) => r.json());
			allTemplates = (res?.data?.templates ?? res?.templates ?? []) as QmsTemplate[];
		} catch {
			/* leave empty */
		}
	}
	async function loadQmsRecords(taskId: string) {
		qmsRecords = [];
		try {
			const res: any = await fetch(`/api/projects/${projectId}/tasks/${taskId}/records`).then((r) => r.json());
			qmsRecords = (res?.data?.records ?? res?.records ?? []) as QmsRecord[];
		} catch {
			/* leave empty */
		}
	}
	// Templates whose taskType matches the editor's current selection, each
	// flagged if already attached. Filtered client-side so changing the dropdown
	// updates instantly (no save needed).
	const qmsSuggestions = $derived.by(() => {
		const tt = editor?.taskType ?? '';
		if (!tt) return [] as Array<QmsTemplate & { attached: boolean }>;
		const attached = new Set(qmsRecords.map((r) => r.templateId));
		return allTemplates
			.filter((t) => t.isActive && t.scope === 'task' && t.taskType === tt)
			.map((t) => ({ ...t, attached: attached.has(t.id) }));
	});

	// Task status is system-managed (read-only in the editor); these just render it.
	const taskStatusLabel = (s: string) =>
		(
			({
				unassigned: '未分配',
				ongoing: '进行中',
				under_review: '待审核',
				completed: '已完成',
				blocked: '受阻（前置未完成）'
			}) as { [k: string]: string }
		)[s] ?? s;
	const taskStatusBadge = (s: string) => {
		switch (s) {
			case 'completed':
				return 'bg-emerald-100 text-emerald-700';
			case 'under_review':
				return 'bg-amber-100 text-amber-700';
			case 'blocked':
				return 'bg-rose-100 text-rose-700';
			case 'ongoing':
				return 'bg-sky-100 text-sky-700';
			default:
				return 'bg-slate-100 text-slate-600';
		}
	};

	const qmsStatusColor = (s: string) => {
		switch (s) {
			case 'approved':
				return 'bg-emerald-100 text-emerald-700';
			case 'submitted':
				return 'bg-amber-100 text-amber-700';
			case 'rejected':
				return 'bg-rose-100 text-rose-700';
			case 'waived':
				return 'bg-slate-200 text-slate-600';
			case 'draft':
				return 'bg-sky-100 text-sky-700';
			default:
				return 'bg-slate-100 text-slate-500';
		}
	};

	async function attachRecord(templateId: string) {
		if (!editor?.id) return;
		qmsBusy = true;
		editorError = null;
		try {
			const res = await fetch(`/api/projects/${projectId}/tasks/${editor.id}/records`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ templateIds: [templateId] })
			});
			if (!res.ok) {
				try {
					const b: any = await res.json();
					editorError = b?.error ?? 'Attach failed.';
				} catch {
					editorError = 'Attach failed.';
				}
			}
			await loadQmsRecords(editor.id);
			await refresh();
		} finally {
			qmsBusy = false;
		}
	}
	async function recordAction(
		recordId: string,
		action: 'submit' | 'approve' | 'reject' | 'waive',
		reason?: string
	) {
		if (!editor?.id) return;
		qmsBusy = true;
		editorError = null;
		try {
			const res = await fetch(`/api/projects/${projectId}/records/${recordId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, reason })
			});
			if (!res.ok) {
				try {
					const b: any = await res.json();
					editorError = b?.error ?? 'Action failed.';
				} catch {
					editorError = 'Action failed.';
				}
			}
			await loadQmsRecords(editor.id);
			await refresh();
			// The gate may have moved the task (under_review / completed / ongoing);
			// reflect that in the still-open editor.
			const fresh = tasks.find((t) => t.id === editor?.id);
			if (fresh && editor) editor.status = fresh.status;
		} finally {
			qmsBusy = false;
		}
	}
	function rejectRecord(recordId: string) {
		const reason = prompt('退回原因（可选）：') ?? '';
		recordAction(recordId, 'reject', reason);
	}
	function waiveRecord(recordId: string) {
		const reason = prompt('豁免原因（说明为何无需此记录）：');
		if (reason === null) return;
		recordAction(recordId, 'waive', reason);
	}
	async function changeResponsible(recordId: string, userId: string) {
		if (!editor?.id) return;
		await fetch(`/api/projects/${projectId}/records/${recordId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'update', responsibleUserId: userId || null })
		});
		await loadQmsRecords(editor.id);
	}

	function openCreatePreset(preset: Partial<Editor>) {
		editor = blankEditor(preset);
		editorError = null;
		taskHistory = [];
		qmsRecords = [];
		ensurePartners();
		ensureTemplates();
	}
	function openCreate(stageId?: string) {
		openCreatePreset({ workflowStageId: stageId && stageId !== '__backlog__' ? stageId : '' });
	}
	// Prefill a new task with the right stage/assignee for the lane the user
	// clicked "+" on (works in both view modes).
	function addToGroup(group: Group) {
		const preset: Partial<Editor> = {};
		if (viewMode === 'assignee') {
			if (group.id.startsWith('u:')) preset.assigneeId = group.id.slice(2);
		} else if (group.id !== '__backlog__') {
			preset.workflowStageId = group.id;
		}
		openCreatePreset(preset);
	}
	function openEdit(t: Task) {
		editor = blankEditor({
			open: true,
			mode: 'edit',
			id: t.id,
			name: t.name,
			description: t.description ?? '',
			status: t.status,
			kind: t.kind ?? 'task',
			startDate: t.startDate ?? '',
			endDate: t.endDate ?? '',
			assigneeId: t.assigneeId ?? '',
			estimatedHours: t.estimatedHours != null ? String(t.estimatedHours) : '',
			progressPct: t.progressPct != null ? String(t.progressPct) : '',
			bufferDays: t.bufferDays != null ? String(t.bufferDays) : '0',
			blockedReason: t.blockedReason ?? '',
			workflowStageId: t.workflowStageId ?? '',
			parentTaskId: t.parentTaskId ?? '',
			outsourcedPartnerId: t.outsourcedPartnerId ?? '',
			subProjectId: t.subProjectId ?? '',
			taskType: t.taskType ?? ''
		});
		editorError = null;
		ensurePartners();
		loadHistory(t.id);
		ensureTemplates();
		loadQmsRecords(t.id);
	}
	function closeEditor() {
		editor = null;
		editorError = null;
		taskHistory = [];
		qmsRecords = [];
	}

	function editorPayload(e: Editor) {
		// `type="number"` inputs bind as numbers (not strings), so never call
		// string methods here. Accept anything and coerce defensively.
		const num = (v: unknown): number | null => {
			if (v === '' || v === null || v === undefined) return null;
			const n = Number(v);
			return Number.isNaN(n) ? null : n;
		};
		return {
			// `status` is system-managed — never sent from the editor.
			name: e.name.trim(),
			description: e.description.trim() || null,
			kind: e.kind,
			startDate: e.startDate || null,
			endDate: e.endDate || null,
			assigneeId: e.assigneeId || null,
			estimatedHours: num(e.estimatedHours),
			progressPct: num(e.progressPct),
			bufferDays: num(e.bufferDays) ?? 0,
			workflowStageId: e.workflowStageId || null,
			parentTaskId: e.parentTaskId || null,
			outsourcedPartnerId: e.outsourcedPartnerId || null,
			subProjectId: e.subProjectId || null,
			taskType: e.taskType || null,
			rescheduleReason: e.rescheduleReason.trim() || null
		};
	}
	async function saveEditor() {
		if (!editor) return;
		editorError = null;
		if (!editor.name.trim()) {
			editorError = 'Task name is required.';
			return;
		}
		saving = true;
		try {
			const payload = editorPayload(editor);
			const url =
				editor.mode === 'create'
					? `/api/projects/${projectId}/tasks`
					: `/api/projects/${projectId}/tasks/${editor.id}`;
			const method = editor.mode === 'create' ? 'POST' : 'PATCH';
			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) {
				let msg = `Save failed (HTTP ${res.status}).`;
				try {
					const body: any = await res.json();
					if (body?.error) msg = body.error;
				} catch {
					/* non-JSON error body */
				}
				editorError = msg;
				return; // keep the modal open so the user can fix / retry
			}
			await refresh();
			editor = null;
		} catch (e) {
			editorError = `Network error: ${(e as Error).message}`;
		} finally {
			saving = false;
		}
	}
	async function deleteTask(id: string) {
		if (!confirm('Delete this task? This cannot be undone from here.')) return;
		await fetch(`/api/projects/${projectId}/tasks/${id}`, { method: 'DELETE' });
		await refresh();
		if (editor?.id === id) editor = null;
	}

	// --------------------------------------------------------------- dependencies
	// Predecessors of the task currently in the editor.
	const editorPreds = $derived.by(() => {
		if (!editor?.id) return [] as Array<{ dep: Dep; from: Task | undefined }>;
		return deps
			.filter((d) => d.toTaskId === editor!.id)
			.map((d) => ({ dep: d, from: tasks.find((t) => t.id === d.fromTaskId) }));
	});
	let newPredId = $state('');
	async function addPredecessor() {
		if (!editor?.id || !newPredId) return;
		await fetch(`/api/projects/${projectId}/tasks/dependencies`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ fromTaskId: newPredId, toTaskId: editor.id })
		});
		newPredId = '';
		await refresh();
	}
	async function removeDep(depId: string) {
		await fetch(`/api/projects/${projectId}/tasks/dependencies/${depId}`, { method: 'DELETE' });
		await refresh();
	}

	// --------------------------------------------------------------- stages mgr
	let stageMgr = $state<{ open: boolean; rows: Array<{ id?: string; name: string }> } | null>(null);
	let stageSaving = $state(false);
	function openStageMgr() {
		stageMgr = {
			open: true,
			rows: [...stages].sort((a, b) => a.orderIndex - b.orderIndex).map((s) => ({ id: s.id, name: s.name }))
		};
	}
	function addStageRow() {
		if (!stageMgr) return;
		stageMgr = { ...stageMgr, rows: [...stageMgr.rows, { name: '' }] };
	}
	function removeStageRow(i: number) {
		if (!stageMgr) return;
		stageMgr = { ...stageMgr, rows: stageMgr.rows.filter((_, idx) => idx !== i) };
	}
	function moveStageRow(i: number, dir: -1 | 1) {
		if (!stageMgr) return;
		const arr = [...stageMgr.rows];
		const j = i + dir;
		if (j < 0 || j >= arr.length) return;
		[arr[i], arr[j]] = [arr[j], arr[i]];
		stageMgr = { ...stageMgr, rows: arr };
	}
	async function saveStages() {
		if (!stageMgr) return;
		const clean = stageMgr.rows.filter((r) => r.name.trim());
		stageSaving = true;
		try {
			await fetch(`/api/projects/${projectId}/stages`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stages: clean.map((r) => ({ id: r.id, name: r.name.trim() })) })
			});
			await refresh();
			stageMgr = null;
		} finally {
			stageSaving = false;
		}
	}

	const assigneeLabel = (u: User) => u.name ?? u.email;
	const otherTasks = $derived(tasks.filter((t) => t.id !== editor?.id));
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} />

{#snippet taskBar(t: Task, rowY: number)}
	{@const c = statusColor(t)}
	{@const isCp = criticalPath.has(t.id)}
	{@const conflicted = conflictedTaskIds.has(t.id)}
	{@const sched = scheduleById[t.id]}
	{@const barStroke = conflicted ? '#f43f5e' : isCp ? '#f59e0b' : c.border}
	{@const barStrokeW = conflicted || isCp ? 1.5 : 1}
	{@const dragSelf = drag && drag.taskId === t.id}
	{@const pv = dragSelf ? dragDeltaDays : 0}
	{@const mv = dragSelf && drag?.mode === 'move' ? pv : 0}
	{@const lf = dragSelf && drag?.mode === 'resize-left' ? pv : 0}
	{@const rt = dragSelf && drag?.mode === 'resize-right' ? pv : 0}
	{@const sDay = dayOffset(t.startDate)}
	{@const bx = dayOffset(t.baselineStart) * pxPerDay}
	{@const bw = Math.max(2, inclusiveDayWidth(t.baselineStart, t.baselineEnd) * pxPerDay)}
	{@const tx = (sDay + mv + lf) * pxPerDay}
	{@const tw = Math.max(6, (inclusiveDayWidth(t.startDate, t.endDate) + rt - lf) * pxPerDay)}
	{@const bufW = (t.bufferDays ?? 0) * pxPerDay}
	{#if t.baselineStart && t.baselineEnd}
		<rect x={bx} y={rowY + ROW_HEIGHT / 2 + 5} width={bw} height="4" rx="2" fill="#cbd5e1" fill-opacity="0.7"></rect>
	{/if}
	{#if t.kind === 'milestone' && t.startDate}
		{@const myc = rowY + ROW_HEIGHT / 2}
		<g style="cursor:grab" onpointerdown={(e) => beginDrag(e, 'move', t)} role="presentation">
			<path d={`M ${tx} ${myc - 8} L ${tx + 8} ${myc} L ${tx} ${myc + 8} L ${tx - 8} ${myc} Z`} fill={isCp ? '#f59e0b' : c.fill} stroke={conflicted ? '#f43f5e' : isCp ? '#b45309' : c.border} stroke-width={conflicted ? 2 : 1}></path>
			<text x={tx + 12} y={myc + 4} font-size="10" fill="#475569">{t.name}</text>
		</g>
	{:else if t.startDate && t.endDate}
		<g style="cursor:grab">
			{#if (t.bufferDays ?? 0) > 0}
				<rect x={tx + tw} y={rowY + (ROW_HEIGHT - BAR_HEIGHT) / 2} width={bufW} height={BAR_HEIGHT} rx="2" fill="url(#bufferHatch)"></rect>
			{/if}
			{#if t.kind !== 'buffer' && sched && sched.freeSlack > 0 && !isCp}
				<rect x={tx + tw + bufW} y={rowY + ROW_HEIGHT / 2 - 1.5} width={sched.freeSlack * pxPerDay} height="3" rx="1.5" fill="#a7f3d0"></rect>
			{/if}
			<rect x={tx} y={rowY + (ROW_HEIGHT - BAR_HEIGHT) / 2} width={tw} height={BAR_HEIGHT} rx="3" fill={t.kind === 'buffer' ? 'url(#bufferHatch)' : c.bar} stroke={barStroke} stroke-width={barStrokeW} onpointerdown={(e) => beginDrag(e, 'move', t)}></rect>
			{#if t.kind !== 'buffer'}
				<rect x={tx} y={rowY + (ROW_HEIGHT - BAR_HEIGHT) / 2} width={Math.max(0, (tw * progressOf(t)) / 100)} height={BAR_HEIGHT} rx="3" fill={c.fill} fill-opacity="0.85" pointer-events="none"></rect>
			{/if}
			<rect x={tx} y={rowY + (ROW_HEIGHT - BAR_HEIGHT) / 2} width="4" height={BAR_HEIGHT} fill="transparent" style="cursor:ew-resize" onpointerdown={(e) => beginDrag(e, 'resize-left', t)}></rect>
			<rect x={tx + tw - 4} y={rowY + (ROW_HEIGHT - BAR_HEIGHT) / 2} width="4" height={BAR_HEIGHT} fill="transparent" style="cursor:ew-resize" onpointerdown={(e) => beginDrag(e, 'resize-right', t)}></rect>
			<text x={tx + 5} y={rowY + ROW_HEIGHT / 2 + 4} font-size="10" fill={c.text} pointer-events="none">{t.name}</text>
			{#if dragSelf && dragPreview}
				<rect x={tx} y={rowY + 1} width="118" height="12" rx="2" fill="#0f172a" fill-opacity="0.85"></rect>
				<text x={tx + 4} y={rowY + 10} font-size="9" font-weight="600" fill="#ffffff">{dragPreview.start} → {dragPreview.end} ({dragPreview.dur}d)</text>
			{/if}
		</g>
	{:else}
		<text x={4} y={rowY + ROW_HEIGHT / 2 + 4} font-size="10" fill="#94a3b8" font-style="italic">{t.name} (no dates)</text>
	{/if}
{/snippet}

<div class="space-y-4">
	<header class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-lg font-medium text-slate-900">Tasks &amp; Gantt</h1>
			<p class="mt-0.5 text-[13px] text-slate-600">
				Switch <span class="font-medium">By stage</span> / <span class="font-medium">By assignee</span>.
				Drag a bar to move it, drag its edges to resize, click it to edit, or drag on an empty row to
				create a task. Ghost bar = baseline drift; yellow = critical path.
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<div class="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
				{#each [['stage', 'By stage'], ['assignee', 'By assignee']] as const as [v, label]}
					<button
						type="button"
						class={`rounded-md px-2.5 py-1 text-[13px] font-medium transition ${
							viewMode === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
						}`}
						onclick={() => (viewMode = v as 'stage' | 'assignee')}
					>
						{label}
					</button>
				{/each}
			</div>
			<button
				type="button"
				onclick={openStageMgr}
				class="rounded-md border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
			>
				Manage stages
			</button>
			<button
				type="button"
				onclick={() => openCreate()}
				class="rounded-md bg-[var(--sf-green)] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#2f5e2c]"
			>
				+ Add task
			</button>
		</div>
	</header>

	{#if data.dataMessage}
		<div class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
			⚠ {data.dataMessage}
		</div>
	{/if}

	{#if conflicts.length > 0}
		<div class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
			<p class="text-[13px] font-semibold text-rose-800">⚠ {conflicts.length} scheduling conflict{conflicts.length === 1 ? '' : 's'}</p>
			<ul class="mt-1 space-y-0.5">
				{#each conflicts as c}
					<li class="text-[12px] text-rose-700">
						<span class="font-medium">{c.type === 'dependency' ? 'Dependency' : 'Resource'}:</span>
						{c.message}
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Toolbar -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3 text-xs text-slate-500">
			<span class="inline-flex items-center gap-1"><span class="h-2 w-3 rounded-sm bg-sky-300"></span>Ongoing</span>
			<span class="inline-flex items-center gap-1"><span class="h-2 w-3 rounded-sm bg-emerald-300"></span>Done</span>
			<span class="inline-flex items-center gap-1"><span class="h-2 w-3 rounded-sm bg-rose-300"></span>Blocked</span>
			<span class="inline-flex items-center gap-1"><span class="h-2 w-3 rounded-sm border border-amber-400 bg-amber-100"></span>Critical path</span>
			<span class="inline-flex items-center gap-1"><span class="h-1.5 w-3 rounded-sm bg-emerald-200"></span>Free slack</span>
			<span class="inline-flex items-center gap-1"><span class="h-2 w-3 rounded-sm ring-2 ring-rose-400"></span>Conflict</span>
		</div>
		<div class="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
			{#each ['day', 'week', 'month'] as const as opt}
				<button
					type="button"
					class={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
						scale === opt ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
					}`}
					onclick={() => (scale = opt as Scale)}
				>
					{opt[0].toUpperCase() + opt.slice(1)}
				</button>
			{/each}
		</div>
	</div>

	{#if tasks.length === 0}
		<p class="text-xs text-slate-500">
			No tasks yet — expand the project below and use a stage's <span class="font-medium">+</span> (or the
			<span class="font-medium">+ Add task</span> button) to create the first one.
		</p>
	{/if}

	<section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			<div class="flex">
				<!-- Left: task list -->
				<div class="w-72 shrink-0 border-r border-slate-200 bg-slate-50/50">
					<div class="flex h-9 items-center border-b border-slate-200 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
						{viewMode === 'assignee' ? 'Project · Assignee' : 'Project · Stage · Task'}
					</div>
					{#each rows as row (row.kind === 'project' ? 'project' : row.kind === 'group' ? `g:${row.group.id}` : `tr:${row.group.id}:${row.y}`)}
						{#if row.kind === 'project'}
							<button
								type="button"
								class="flex w-full items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-2 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100"
								style={`height:${ROW_HEIGHT}px`}
								onclick={() => (projectExpanded = !projectExpanded)}
							>
								<span class="text-slate-400">{projectExpanded ? '▼' : '▶'}</span>
								<span class="truncate">{project?.name ?? 'Project'}</span>
								{#if projectBar}<span class="ml-auto shrink-0 text-[10px] font-normal text-slate-400">{projectBar.done}/{projectBar.total}</span>{/if}
							</button>
						{:else if row.kind === 'group'}
							<div
								class="flex items-center gap-1.5 border-b border-slate-100 bg-slate-100/70 px-2 text-[11px] font-semibold text-slate-600"
								style={`height:${ROW_HEIGHT}px`}
							>
								<button type="button" class="text-slate-400" onclick={() => toggleLane(row.group.id)}>
									{collapsed.has(row.group.id) ? '▶' : '▼'}
								</button>
								{#if row.group.color}
									<span class="h-2 w-2 rounded-full" style={`background:${row.group.color}`}></span>
								{/if}
								<span class="truncate">{row.group.label}</span>
								<span class="ml-auto rounded-full bg-white px-1.5 text-[10px] text-slate-500">{row.group.tasks.length}</span>
								<button
									type="button"
									class="text-sm text-slate-400 hover:text-[var(--sf-green)]"
									title="Add task to this lane"
									onclick={() => addToGroup(row.group)}
								>+</button>
							</div>
						{:else if row.single}
							{@const t = row.single}
							<button
								type="button"
								class="block w-full border-b border-slate-100 px-3 pl-7 text-left hover:bg-slate-100"
								style={`height:${ROW_HEIGHT}px`}
								onclick={() => openEdit(t)}
							>
								<div class="flex items-center gap-1.5">
									{#if t.kind === 'milestone'}<span class="text-amber-500">◆</span>{/if}
									<span class="truncate text-xs font-medium text-slate-800">{t.name}</span>
									{#if t.outsourcedPartnerId || t.subProjectId}<span class="shrink-0 text-violet-500" title="Outsourced / sub-project">⇢</span>{/if}
									{#if criticalPath.has(t.id)}<span class="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title="Critical path"></span>{/if}
									{#if conflictedTaskIds.has(t.id)}<span class="ml-auto shrink-0 text-rose-500" title="Has a conflict">⚠</span>{/if}
								</div>
								<p class="truncate text-[10px] text-slate-400">
									{viewMode === 'assignee'
										? (t.startDate ?? '') + (t.endDate ? ` → ${t.endDate}` : '')
										: (t.assigneeName ?? t.assigneeEmail ?? '— unassigned —')}{t.estimatedHours ? ` · ${t.estimatedHours}h` : ''}
								</p>
							</button>
						{:else}
							<div class="flex items-center border-b border-slate-100 px-3 pl-7 text-[10px] text-slate-300" style={`height:${ROW_HEIGHT}px`}>
								{row.tasks.length === 0 ? 'drag on the timeline to add →' : `${row.tasks.length} tasks`}
							</div>
						{/if}
					{/each}
				</div>

				<!-- Right: chart -->
				<div class="min-w-0 flex-1 overflow-x-auto">
					<svg width={chartWidth} height={chartHeight} xmlns="http://www.w3.org/2000/svg" class="select-none">
						<defs>
							<pattern id="bufferHatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
								<rect width="6" height="6" fill="#ede9fe"></rect>
								<line x1="0" y1="0" x2="0" y2="6" stroke="#c4b5fd" stroke-width="2"></line>
							</pattern>
						</defs>

						<!-- ticks -->
						<rect x="0" y="0" width={chartWidth} height={TICK_HEIGHT} fill="#f8fafc"></rect>
						{#each ticks as tick}
							<line x1={tick.x} x2={tick.x} y1="0" y2={chartHeight} stroke={tick.major ? '#cbd5e1' : '#eef2f6'} stroke-width={tick.major ? 1 : 0.5}></line>
							<text x={tick.x + 3} y={22} font-size="10" fill={tick.major ? '#475569' : '#94a3b8'}>{tick.label}</text>
						{/each}
						{#if todayX >= 0 && todayX <= chartWidth}
							<line x1={todayX} x2={todayX} y1="0" y2={chartHeight} stroke="#16a34a" stroke-width="1.5" stroke-dasharray="4 2"></line>
							<text x={todayX + 3} y={12} font-size="9" fill="#16a34a" font-weight="600">Today</text>
						{/if}

						<!-- rows -->
						{#each rows as row (row.kind === 'project' ? 'project' : row.kind === 'group' ? `g:${row.group.id}` : `tr:${row.group.id}:${row.y}`)}
							{#if row.kind === 'project'}
								<rect x="0" y={row.y} width={chartWidth} height={ROW_HEIGHT} fill="#f8fafc"></rect>
								{#if projectBar}
									{@const px = Math.max(0, projectBar.startDay * pxPerDay)}
									{@const pw = Math.max(8, projectBar.widthDays * pxPerDay)}
									{@const py = row.y + (ROW_HEIGHT - 20) / 2}
									<rect x={px} y={py} width={pw} height="20" rx="5" fill={projectBar.urg.soft} stroke={projectBar.urg.border} stroke-width="1"></rect>
									<rect x={px} y={py} width={Math.max(0, (pw * projectBar.pct) / 100)} height="20" rx="5" fill={projectBar.urg.fill} fill-opacity="0.8"></rect>
									<text x={px + 7} y={row.y + ROW_HEIGHT / 2 + 4} font-size="11" font-weight="600" fill={projectBar.urg.text}>{project?.name ?? ''} · {projectBar.pct}%</text>
								{/if}
							{:else if row.kind === 'group'}
								{@const gt = row.group.tasks}
								{@const gStart = Math.min(...gt.map((t) => dayOffset(t.startDate)).filter((n) => !Number.isNaN(n)), Infinity)}
								{@const gEnd = Math.max(...gt.map((t) => dayOffset(t.endDate)).filter((n) => !Number.isNaN(n)), -Infinity)}
								<rect x="0" y={row.y} width={chartWidth} height={ROW_HEIGHT} fill="#f1f5f9"></rect>
								{#if gt.length > 0 && Number.isFinite(gStart) && Number.isFinite(gEnd) && collapsed.has(row.group.id)}
									{@const lx = Math.max(0, gStart * pxPerDay)}
									{@const lw = Math.max(8, (gEnd - gStart + 1) * pxPerDay)}
									<rect x={lx} y={row.y + (ROW_HEIGHT - 8) / 2} width={lw} height="8" rx="4" fill={row.group.color ?? '#94a3b8'} fill-opacity="0.45"></rect>
								{/if}
							{:else}
								<!-- track row: empty background is the drag-to-create surface; bars sit on top -->
								<rect
									x="0"
									y={row.y}
									width={chartWidth}
									height={ROW_HEIGHT}
									fill="#ffffff"
									style="cursor:crosshair"
									role="presentation"
									onpointerdown={(e) => beginCreateDrag(e, row.group, row.y)}
								></rect>
								{#if viewMode === 'assignee'}
									{#each stageRanges as range (range.id)}
										{@const sx = Math.max(0, range.startDay * pxPerDay)}
										{@const sw = Math.max(1, (range.endDay - range.startDay + 1) * pxPerDay)}
										<rect x={sx} y={row.y} width={sw} height={ROW_HEIGHT} fill={range.color} fill-opacity="0.065">
											<title>{range.label}</title>
										</rect>
									{/each}
								{/if}
								{#each row.tasks as t (t.id)}
									{@render taskBar(t, row.y)}
								{/each}
								{#if viewMode === 'stage' && row.single}
									{@const tt = row.single}
									{@const ttx = dayOffset(tt.startDate) * pxPerDay}
									{#each deps.filter((d) => d.toTaskId === tt.id) as dep}
										{@const from = tasks.find((x) => x.id === dep.fromTaskId)}
										{@const fy = taskY[dep.fromTaskId]}
										{#if from && from.endDate && tt.startDate && fy != null}
											{@const fx = (dayOffset(from.endDate) + 1) * pxPerDay}
											<path
												d={`M ${fx} ${fy + ROW_HEIGHT / 2} L ${fx + 6} ${fy + ROW_HEIGHT / 2} L ${fx + 6} ${row.y + ROW_HEIGHT / 2} L ${ttx} ${row.y + ROW_HEIGHT / 2}`}
												fill="none"
												stroke={dep.isBlocking ? '#94a3b8' : '#cbd5e1'}
												stroke-width="1"
												stroke-dasharray={dep.isBlocking ? '0' : '2 2'}
												marker-end="url(#arrow)"
											></path>
										{/if}
									{/each}
								{/if}
							{/if}
						{/each}

						<!-- drag-to-create preview -->
						{#if createDrag}
							{@const lo = Math.min(createDrag.startDay, createDrag.curDay)}
							{@const hi = Math.max(createDrag.startDay, createDrag.curDay)}
							<rect x={lo * pxPerDay} y={createDrag.y + (ROW_HEIGHT - BAR_HEIGHT) / 2} width={Math.max(2, (hi - lo + 1) * pxPerDay)} height={BAR_HEIGHT} rx="3" fill="#86efac" fill-opacity="0.5" stroke="#16a34a" stroke-dasharray="3 2"></rect>
						{/if}
						<defs>
							<marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
								<path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8"></path>
							</marker>
						</defs>
					</svg>
				</div>
			</div>
		</section>
		<p class="text-xs text-slate-500">Drag a bar to move it; edge handles resize. Click a task name to edit, set dependencies, progress, and buffer.</p>

		{#if workload.length > 0}
			<section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<h2 class="text-[13px] font-semibold text-slate-700">Workload (open tasks)</h2>
				<div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
					{#each workload as w (w.id)}
						<div class={`rounded-lg border px-3 py-2 ${w.overloaded ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-slate-50/50'}`}>
							<div class="flex items-center justify-between gap-2">
								<span class="truncate text-xs font-medium text-slate-800">{w.name}</span>
								{#if w.overloaded}<span class="shrink-0 rounded-full bg-rose-100 px-1.5 text-[10px] font-medium text-rose-700">overloaded</span>{/if}
							</div>
							<p class="mt-0.5 text-[11px] text-slate-500">{w.taskCount} task{w.taskCount === 1 ? '' : 's'}{w.hours > 0 ? ` · ${w.hours}h planned` : ''}</p>
						</div>
					{/each}
				</div>
			</section>
		{/if}
</div>

<!-- Task editor modal -->
{#if editor}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button type="button" class="absolute inset-0 bg-slate-900/40" aria-label="Close" onclick={closeEditor}></button>
		<div class="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
			<div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
				<h2 class="text-sm font-semibold text-slate-900">{editor.mode === 'create' ? 'New task' : 'Edit task'}</h2>
				<button type="button" class="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100" onclick={closeEditor}>×</button>
			</div>
			<div class="space-y-3 px-5 py-4 text-sm">
				<label class="block">
					<span class="text-xs font-medium text-slate-500">Name</span>
					<input bind:value={editor.name} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5" placeholder="Task name" />
				</label>
				<div class="grid grid-cols-2 gap-3">
					<label class="block">
						<span class="text-xs font-medium text-slate-500">Start</span>
						<input type="date" bind:value={editor.startDate} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5" />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-slate-500">End</span>
						<input type="date" bind:value={editor.endDate} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5" />
					</label>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<label class="block">
						<span class="text-xs font-medium text-slate-500">Type</span>
						<select bind:value={editor.kind} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5">
							<option value="task">Task</option>
							<option value="milestone">Milestone</option>
							<option value="buffer">Buffer</option>
						</select>
					</label>
					<div class="block">
						<span class="text-xs font-medium text-slate-500">Status（系统自动）</span>
						<div class="mt-1 flex h-[34px] items-center">
							<span class="rounded-full px-2 py-0.5 text-[11px] {taskStatusBadge(editor.status)}">{taskStatusLabel(editor.status)}</span>
						</div>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<label class="block">
						<span class="text-xs font-medium text-slate-500">Assignee</span>
						<select bind:value={editor.assigneeId} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5">
							<option value="">— unassigned —</option>
							{#each users as u}<option value={u.id}>{assigneeLabel(u)}</option>{/each}
						</select>
					</label>
					<label class="block">
						<span class="text-xs font-medium text-slate-500">Stage</span>
						<select bind:value={editor.workflowStageId} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5">
							<option value="">— backlog —</option>
							{#each stages as s}<option value={s.id}>{s.name}</option>{/each}
						</select>
					</label>
				</div>
				<label class="block">
					<span class="text-xs font-medium text-slate-500">Task type（ISO 记录匹配键）</span>
					<select bind:value={editor.taskType} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5">
						{#each TASK_TYPES as tt}<option value={tt.value}>{tt.label}</option>{/each}
					</select>
				</label>
				<div class="grid grid-cols-3 gap-3">
					<label class="block">
						<span class="text-xs font-medium text-slate-500">Est. hours</span>
						<input type="number" min="0" bind:value={editor.estimatedHours} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5" />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-slate-500">Progress %</span>
						<input type="number" min="0" max="100" bind:value={editor.progressPct} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5" />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-slate-500">Buffer days</span>
						<input type="number" min="0" bind:value={editor.bufferDays} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5" />
					</label>
				</div>
				{#if editor.status === 'blocked'}
					<p class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
						受阻：存在未完成的前置（阻塞型）任务。前置完成后会自动解除。
					</p>
				{/if}

				<!-- Outsourcing (P4) -->
				<div class="grid grid-cols-2 gap-3">
					<label class="block">
						<span class="text-xs font-medium text-slate-500">Outsource to partner</span>
						<select bind:value={editor.outsourcedPartnerId} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5">
							<option value="">— in-house —</option>
							{#each partners as p}<option value={p.id}>{p.name}</option>{/each}
						</select>
					</label>
					<label class="block">
						<span class="text-xs font-medium text-slate-500">Delivered by sub-project</span>
						<select bind:value={editor.subProjectId} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5">
							<option value="">— none —</option>
							{#each subProjects as sp}<option value={sp.id}>{sp.name}</option>{/each}
						</select>
						{#if editor.subProjectId}
							<a href={`/projects/${editor.subProjectId}/tasks`} class="mt-1 inline-block text-[11px] font-medium text-[var(--sf-green)] hover:underline">Open sub-project Gantt →</a>
						{/if}
					</label>
				</div>

				<label class="block">
					<span class="text-xs font-medium text-slate-500">Description</span>
					<textarea bind:value={editor.description} rows="2" class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5"></textarea>
				</label>

				{#if editor.mode === 'edit'}
					<label class="block">
						<span class="text-xs font-medium text-slate-500">Reschedule note (logged if you change dates)</span>
						<input bind:value={editor.rescheduleReason} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5" placeholder="e.g. client delayed sign-off" />
					</label>
				{/if}

				{#if editor.mode === 'edit'}
					<div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
						<p class="text-xs font-semibold text-slate-600">Depends on (predecessors)</p>
						{#if editorPreds.length > 0}
							<ul class="mt-1.5 space-y-1">
								{#each editorPreds as p}
									<li class="flex items-center gap-2 text-xs">
										<span class="text-slate-400">{p.dep.isBlocking ? '⛔' : '↗'}</span>
										<span class="truncate text-slate-700">{p.from?.name ?? p.dep.fromTaskId}</span>
										<button type="button" class="ml-auto text-rose-500 hover:underline" onclick={() => removeDep(p.dep.id)}>remove</button>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="mt-1 text-xs text-slate-400">No predecessors.</p>
						{/if}
						<div class="mt-2 flex items-center gap-2">
							<select bind:value={newPredId} class="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs">
								<option value="">+ add predecessor…</option>
								{#each otherTasks as t}<option value={t.id}>{t.name}</option>{/each}
							</select>
							<button type="button" class="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-white" disabled={!newPredId} onclick={addPredecessor}>Add</button>
						</div>
					</div>

					{#if taskHistory.length > 0}
						<div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
							<p class="text-xs font-semibold text-slate-600">Reschedule history</p>
							<ul class="mt-1.5 space-y-1.5">
								{#each taskHistory as h (h.id)}
									<li class="text-[11px] text-slate-600">
										<span class="font-medium text-slate-700">{h.createdAt?.slice(0, 10)}</span>
										· {h.oldStart ?? '?'}→{h.oldEnd ?? '?'} ⇒ <span class="text-slate-800">{h.newStart ?? '?'}→{h.newEnd ?? '?'}</span>
										{#if h.reason}<span class="text-slate-500"> — {h.reason}</span>{/if}
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					<!-- ISO 9001 records -->
					<div class="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
						<p class="text-xs font-semibold text-emerald-800">ISO 9001 记录</p>
						{#if !editor.taskType}
							<p class="mt-1 text-xs text-slate-500">选择上方 “Task type” 后，系统会建议本任务需要的 ISO 记录。</p>
						{:else}
							{#if qmsRecords.length > 0}
								<ul class="mt-2 space-y-2">
									{#each qmsRecords as r (r.id)}
										<li class="rounded-md border border-slate-200 bg-white p-2">
											<div class="flex flex-wrap items-center gap-2">
												<span class="rounded-full px-2 py-0.5 text-[10px] {qmsStatusColor(r.status)}">{r.status}</span>
												<span class="truncate text-xs font-medium text-slate-700">{r.code ? r.code + ' · ' : ''}{r.name}</span>
												{#if r.requiresApproval}<span class="text-[10px] text-amber-600">需审批</span>{/if}
												{#if !r.isRequired}<span class="text-[10px] text-slate-400">非必需</span>{/if}
												{#if r.version > 1}<span class="text-[10px] text-slate-400">v{r.version}</span>{/if}
											</div>
											{#if r.rejectedReason && r.status === 'rejected'}
												<p class="mt-1 text-[11px] text-rose-600">退回：{r.rejectedReason}</p>
											{/if}
											<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
												<select
													class="rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px]"
													value={r.responsibleUserId ?? ''}
													onchange={(e) => changeResponsible(r.id, (e.currentTarget as HTMLSelectElement).value)}
												>
													<option value="">— 责任人 —</option>
													{#each users as u}<option value={u.id}>{assigneeLabel(u)}</option>{/each}
												</select>
												{#if r.status !== 'approved' && r.status !== 'waived'}
													<button type="button" class="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] hover:bg-slate-50" disabled={qmsBusy} onclick={() => recordAction(r.id, 'submit')}>提交</button>
												{/if}
												{#if canManage}
													{#if r.status === 'submitted'}
														<button type="button" class="rounded-md border border-emerald-300 px-2 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-50" disabled={qmsBusy} onclick={() => recordAction(r.id, 'approve')}>通过</button>
														<button type="button" class="rounded-md border border-rose-300 px-2 py-0.5 text-[11px] text-rose-700 hover:bg-rose-50" disabled={qmsBusy} onclick={() => rejectRecord(r.id)}>退回</button>
													{/if}
													{#if r.status !== 'waived' && r.status !== 'approved'}
														<button type="button" class="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50" disabled={qmsBusy} onclick={() => waiveRecord(r.id)}>豁免</button>
													{/if}
												{/if}
											</div>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="mt-1 text-xs text-slate-400">尚未附加任何记录。</p>
							{/if}
							{#if qmsSuggestions.filter((s) => !s.attached).length > 0}
								<p class="mt-2 text-[11px] font-medium text-slate-500">建议附加：</p>
								<div class="mt-1 flex flex-wrap gap-1.5">
									{#each qmsSuggestions.filter((s) => !s.attached) as s (s.id)}
										<button type="button" class="rounded-md border border-emerald-300 bg-white px-2 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-50" disabled={qmsBusy} onclick={() => attachRecord(s.id)}>+ {s.code} {s.name}</button>
									{/each}
								</div>
							{:else if qmsSuggestions.length === 0}
								<p class="mt-2 text-[11px] text-slate-400">该 task type 暂无匹配的 ISO 模板。</p>
							{/if}
						{/if}
					</div>
				{/if}
			</div>
			{#if editorError}
				<div class="mx-5 mb-1 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{editorError}</div>
			{/if}
			<div class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
				{#if editor.mode === 'edit' && editor.id}
					<button type="button" class="text-xs font-medium text-rose-600 hover:underline" onclick={() => deleteTask(editor!.id!)}>Delete</button>
				{:else}<span></span>{/if}
				<div class="flex items-center gap-2">
					<button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white" onclick={closeEditor}>Cancel</button>
					<button type="button" class="rounded-md bg-[var(--sf-green)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2f5e2c] disabled:opacity-60" disabled={saving} onclick={saveEditor}>{saving ? 'Saving…' : 'Save'}</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Stage manager modal -->
{#if stageMgr}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button type="button" class="absolute inset-0 bg-slate-900/40" aria-label="Close" onclick={() => (stageMgr = null)}></button>
		<div class="relative w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
			<div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
				<h2 class="text-sm font-semibold text-slate-900">Workflow stages</h2>
				<button type="button" class="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100" onclick={() => (stageMgr = null)}>×</button>
			</div>
			<div class="space-y-2 px-5 py-4">
				{#each stageMgr.rows as row, i}
					<div class="flex items-center gap-2">
						<span class="w-5 text-center text-xs text-slate-400">{i + 1}</span>
						<input bind:value={row.name} class="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" placeholder="Stage name" />
						<button type="button" class="text-slate-400 hover:text-slate-600" onclick={() => moveStageRow(i, -1)} title="Move up">↑</button>
						<button type="button" class="text-slate-400 hover:text-slate-600" onclick={() => moveStageRow(i, 1)} title="Move down">↓</button>
						<button type="button" class="text-rose-400 hover:text-rose-600" onclick={() => removeStageRow(i)} title="Remove">×</button>
					</div>
				{/each}
				<button type="button" class="text-xs font-medium text-[var(--sf-green)] hover:underline" onclick={addStageRow}>+ Add stage</button>
				<p class="text-[11px] text-slate-400">Removing a stage moves its tasks back to Backlog. Existing stages keep their progress.</p>
			</div>
			<div class="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
				<button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white" onclick={() => (stageMgr = null)}>Cancel</button>
				<button type="button" class="rounded-md bg-[var(--sf-green)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2f5e2c] disabled:opacity-60" disabled={stageSaving} onclick={saveStages}>{stageSaving ? 'Saving…' : 'Save stages'}</button>
			</div>
		</div>
	</div>
{/if}
