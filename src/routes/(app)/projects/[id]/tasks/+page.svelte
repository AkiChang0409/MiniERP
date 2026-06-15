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
		return Number.isNaN(t) ? null : t;
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
		const today = Date.now();
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
	const todayX = $derived((Math.round((Date.now() - windowMs.from) / ONE_DAY)) * pxPerDay);

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

	// --------------------------------------------------------------- swimlanes
	let collapsed = $state<Set<string>>(new Set());
	function toggleLane(id: string) {
		const next = new Set(collapsed);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		collapsed = next;
	}

	type Lane = { id: string; name: string; color: string | null; tasks: Task[] };
	const lanes = $derived.by<Lane[]>(() => {
		const stageIds = new Set(stages.map((s) => s.id));
		const byStage = new Map<string, Task[]>();
		const backlog: Task[] = [];
		for (const t of tasks) {
			// Orphaned tasks (stage was deleted) fall back to Backlog so they
			// never silently disappear from the chart.
			if (t.workflowStageId && stageIds.has(t.workflowStageId)) {
				const arr = byStage.get(t.workflowStageId) ?? [];
				arr.push(t);
				byStage.set(t.workflowStageId, arr);
			} else {
				backlog.push(t);
			}
		}
		const sortTasks = (arr: Task[]) =>
			arr.sort(
				(a, b) =>
					a.orderIndex - b.orderIndex ||
					(parse(a.startDate) ?? 0) - (parse(b.startDate) ?? 0)
			);
		const out: Lane[] = [];
		for (const s of [...stages].sort((a, b) => a.orderIndex - b.orderIndex)) {
			out.push({ id: s.id, name: s.name, color: s.color, tasks: sortTasks(byStage.get(s.id) ?? []) });
		}
		// Backlog lane is always present so unstaged tasks have a home and you can
		// add one even on a brand-new project.
		out.push({ id: '__backlog__', name: 'Backlog (no stage)', color: null, tasks: sortTasks(backlog) });
		return out;
	});

	// Flat row geometry: a lane-header row, then its task rows (unless collapsed).
	type Row =
		| { kind: 'lane'; y: number; lane: Lane }
		| { kind: 'task'; y: number; lane: Lane; task: Task };
	const rows = $derived.by<Row[]>(() => {
		const out: Row[] = [];
		let y = TICK_HEIGHT;
		for (const lane of lanes) {
			out.push({ kind: 'lane', y, lane });
			y += ROW_HEIGHT;
			if (!collapsed.has(lane.id)) {
				for (const task of lane.tasks) {
					out.push({ kind: 'task', y, lane, task });
					y += ROW_HEIGHT;
				}
			}
		}
		return out;
	});
	const chartHeight = $derived(
		rows.length === 0 ? TICK_HEIGHT + ROW_HEIGHT : rows[rows.length - 1].y + ROW_HEIGHT
	);
	const taskY = $derived.by<Record<string, number>>(() => {
		const m: Record<string, number> = {};
		for (const r of rows) if (r.kind === 'task') m[r.task.id] = r.y;
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
	function onPointerMove(e: PointerEvent) {
		if (!drag) return;
		dragDeltaDays = Math.round((e.clientX - drag.startX) / pxPerDay);
	}
	async function onPointerUp() {
		if (!drag) return;
		const days = dragDeltaDays;
		const d = drag;
		drag = null;
		dragDeltaDays = 0;
		if (days === 0) return;
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
		...preset
	});
	let editor = $state<Editor | null>(null);
	let saving = $state(false);
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

	function openCreate(stageId?: string) {
		editor = blankEditor({ workflowStageId: stageId && stageId !== '__backlog__' ? stageId : '' });
		taskHistory = [];
		ensurePartners();
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
			subProjectId: t.subProjectId ?? ''
		});
		ensurePartners();
		loadHistory(t.id);
	}
	function closeEditor() {
		editor = null;
		taskHistory = [];
	}

	function editorPayload(e: Editor) {
		const num = (s: string) => (s.trim() === '' ? null : Number(s));
		return {
			name: e.name.trim(),
			description: e.description.trim() || null,
			status: e.status,
			kind: e.kind,
			startDate: e.startDate || null,
			endDate: e.endDate || null,
			assigneeId: e.assigneeId || null,
			estimatedHours: num(e.estimatedHours),
			progressPct: num(e.progressPct),
			bufferDays: num(e.bufferDays) ?? 0,
			blockedReason: e.blockedReason.trim() || null,
			workflowStageId: e.workflowStageId || null,
			parentTaskId: e.parentTaskId || null,
			outsourcedPartnerId: e.outsourcedPartnerId || null,
			subProjectId: e.subProjectId || null,
			rescheduleReason: e.rescheduleReason.trim() || null
		};
	}
	async function saveEditor() {
		if (!editor) return;
		if (!editor.name.trim()) return;
		saving = true;
		try {
			const payload = editorPayload(editor);
			if (editor.mode === 'create') {
				await fetch(`/api/projects/${projectId}/tasks`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				});
			} else if (editor.id) {
				await fetch(`/api/projects/${projectId}/tasks/${editor.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				});
			}
			await refresh();
			editor = null;
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

<div class="space-y-4">
	<header class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-lg font-medium text-slate-900">Tasks &amp; Gantt</h1>
			<p class="mt-0.5 text-[13px] text-slate-600">
				Swimlanes by stage. Solid bar = planned, ghost bar = baseline (drift), fill = progress.
				Yellow outline marks the critical path.
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-2">
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
		<div class="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
			<p class="text-sm text-slate-500">No tasks yet.</p>
			<button
				type="button"
				onclick={() => openCreate()}
				class="mt-3 rounded-md bg-[var(--sf-green)] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#2f5e2c]"
			>
				+ Add the first task
			</button>
		</div>
	{:else}
		<section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			<div class="flex">
				<!-- Left: task list -->
				<div class="w-72 shrink-0 border-r border-slate-200 bg-slate-50/50">
					<div class="flex h-9 items-center border-b border-slate-200 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
						Task
					</div>
					{#each rows as row (row.kind === 'lane' ? `l:${row.lane.id}` : `t:${row.task.id}`)}
						{#if row.kind === 'lane'}
							<div
								class="flex items-center gap-1.5 border-b border-slate-100 bg-slate-100/70 px-2 text-[11px] font-semibold text-slate-600"
								style={`height:${ROW_HEIGHT}px`}
							>
								<button type="button" class="text-slate-400" onclick={() => toggleLane(row.lane.id)}>
									{collapsed.has(row.lane.id) ? '▶' : '▼'}
								</button>
								{#if row.lane.color}
									<span class="h-2 w-2 rounded-full" style={`background:${row.lane.color}`}></span>
								{/if}
								<span class="truncate">{row.lane.name}</span>
								<span class="ml-auto rounded-full bg-white px-1.5 text-[10px] text-slate-500">{row.lane.tasks.length}</span>
								{#if row.lane.id !== '__backlog__'}
									<button
										type="button"
										class="text-slate-400 hover:text-[var(--sf-green)]"
										title="Add task to this stage"
										onclick={() => openCreate(row.lane.id)}
									>+</button>
								{/if}
							</div>
						{:else}
							{@const t = row.task}
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
									{t.assigneeName ?? t.assigneeEmail ?? '— unassigned —'}{t.estimatedHours ? ` · ${t.estimatedHours}h` : ''}
								</p>
							</button>
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
						{#each rows as row (row.kind === 'lane' ? `l:${row.lane.id}` : `t:${row.task.id}`)}
							{#if row.kind === 'lane'}
								<rect x="0" y={row.y} width={chartWidth} height={ROW_HEIGHT} fill="#f1f5f9"></rect>
							{:else}
								{@const t = row.task}
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
								{@const eDay = dayOffset(t.endDate)}
								{@const bx = (dayOffset(t.baselineStart) ) * pxPerDay}
								{@const bw = Math.max(2, (dayOffset(t.baselineEnd) - dayOffset(t.baselineStart)) * pxPerDay)}
								{@const tx = (sDay + mv + lf) * pxPerDay}
								{@const tw = Math.max(6, (eDay - sDay + rt - lf) * pxPerDay)}
								<rect x="0" y={row.y} width={chartWidth} height={ROW_HEIGHT} fill="#ffffff"></rect>

								<!-- baseline ghost -->
								{#if t.baselineStart && t.baselineEnd}
									<rect x={bx} y={row.y + ROW_HEIGHT / 2 + 5} width={bw} height="4" rx="2" fill="#cbd5e1" fill-opacity="0.7"></rect>
								{/if}

								{#if t.kind === 'milestone' && t.startDate}
									<!-- milestone diamond at start -->
									{@const mxc = tx}
									{@const myc = row.y + ROW_HEIGHT / 2}
									<g style="cursor:grab" onpointerdown={(e) => beginDrag(e, 'move', t)} role="presentation">
										<path
											d={`M ${mxc} ${myc - 8} L ${mxc + 8} ${myc} L ${mxc} ${myc + 8} L ${mxc - 8} ${myc} Z`}
											fill={isCp ? '#f59e0b' : c.fill}
											stroke={conflicted ? '#f43f5e' : isCp ? '#b45309' : c.border}
											stroke-width={conflicted ? 2 : 1}
										></path>
										<text x={mxc + 12} y={myc + 4} font-size="10" fill="#475569">{t.name}</text>
									</g>
								{:else if t.startDate && t.endDate}
									{@const bufW = (t.bufferDays ?? 0) * pxPerDay}
									<g style="cursor:grab">
										<!-- buffer block appended after the bar (explicit reserve) -->
										{#if (t.bufferDays ?? 0) > 0}
											<rect x={tx + tw} y={row.y + (ROW_HEIGHT - BAR_HEIGHT) / 2} width={bufW} height={BAR_HEIGHT} rx="2" fill="url(#bufferHatch)"></rect>
										{/if}
										<!-- free-slack tail (computed CPM float) after the bar + buffer -->
										{#if t.kind !== 'buffer' && sched && sched.freeSlack > 0 && !isCp}
											<rect x={tx + tw + bufW} y={row.y + ROW_HEIGHT / 2 - 1.5} width={sched.freeSlack * pxPerDay} height="3" rx="1.5" fill="#a7f3d0"></rect>
											<line x1={tx + tw + bufW + sched.freeSlack * pxPerDay} x2={tx + tw + bufW + sched.freeSlack * pxPerDay} y1={row.y + ROW_HEIGHT / 2 - 4} y2={row.y + ROW_HEIGHT / 2 + 4} stroke="#6ee7b7" stroke-width="1"></line>
										{/if}
										<!-- planned bar -->
										<rect
											x={tx}
											y={row.y + (ROW_HEIGHT - BAR_HEIGHT) / 2}
											width={tw}
											height={BAR_HEIGHT}
											rx="3"
											fill={t.kind === 'buffer' ? 'url(#bufferHatch)' : c.bar}
											stroke={barStroke}
											stroke-width={barStrokeW}
											onpointerdown={(e) => beginDrag(e, 'move', t)}
										></rect>
										<!-- progress fill -->
										{#if t.kind !== 'buffer'}
											<rect x={tx} y={row.y + (ROW_HEIGHT - BAR_HEIGHT) / 2} width={Math.max(0, (tw * progressOf(t)) / 100)} height={BAR_HEIGHT} rx="3" fill={c.fill} fill-opacity="0.85" pointer-events="none"></rect>
										{/if}
										<!-- resize handles -->
										<rect x={tx} y={row.y + (ROW_HEIGHT - BAR_HEIGHT) / 2} width="4" height={BAR_HEIGHT} fill="transparent" style="cursor:ew-resize" onpointerdown={(e) => beginDrag(e, 'resize-left', t)}></rect>
										<rect x={tx + tw - 4} y={row.y + (ROW_HEIGHT - BAR_HEIGHT) / 2} width="4" height={BAR_HEIGHT} fill="transparent" style="cursor:ew-resize" onpointerdown={(e) => beginDrag(e, 'resize-right', t)}></rect>
										<text x={tx + 5} y={row.y + ROW_HEIGHT / 2 + 4} font-size="10" fill={c.text} pointer-events="none">{t.name}</text>
									</g>
								{:else}
									<text x={4} y={row.y + ROW_HEIGHT / 2 + 4} font-size="10" fill="#94a3b8" font-style="italic">{t.name} (no dates)</text>
								{/if}

								<!-- dependency arrows into this task -->
								{#each deps.filter((d) => d.toTaskId === t.id) as dep}
									{@const from = tasks.find((x) => x.id === dep.fromTaskId)}
									{@const fy = taskY[dep.fromTaskId]}
									{#if from && from.endDate && t.startDate && fy != null}
										{@const fx = (dayOffset(from.endDate) + 1) * pxPerDay}
										<path
											d={`M ${fx} ${fy + ROW_HEIGHT / 2} L ${fx + 6} ${fy + ROW_HEIGHT / 2} L ${fx + 6} ${row.y + ROW_HEIGHT / 2} L ${tx} ${row.y + ROW_HEIGHT / 2}`}
											fill="none"
											stroke={dep.isBlocking ? '#94a3b8' : '#cbd5e1'}
											stroke-width="1"
											stroke-dasharray={dep.isBlocking ? '0' : '2 2'}
											marker-end="url(#arrow)"
										></path>
									{/if}
								{/each}
							{/if}
						{/each}
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
					<label class="block">
						<span class="text-xs font-medium text-slate-500">Status</span>
						<select bind:value={editor.status} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5">
							<option value="unassigned">Unassigned</option>
							<option value="ongoing">Ongoing</option>
							<option value="under_review">Under review</option>
							<option value="completed">Completed</option>
							<option value="blocked">Blocked</option>
						</select>
					</label>
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
					<label class="block">
						<span class="text-xs font-medium text-slate-500">Blocked reason</span>
						<input bind:value={editor.blockedReason} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5" placeholder="Why is it blocked?" />
					</label>
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
				{/if}
			</div>
			<div class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
				{#if editor.mode === 'edit' && editor.id}
					<button type="button" class="text-xs font-medium text-rose-600 hover:underline" onclick={() => deleteTask(editor!.id!)}>Delete</button>
				{:else}<span></span>{/if}
				<div class="flex items-center gap-2">
					<button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white" onclick={closeEditor}>Cancel</button>
					<button type="button" class="rounded-md bg-[var(--sf-green)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2f5e2c] disabled:opacity-60" disabled={saving || !editor.name.trim()} onclick={saveEditor}>{saving ? 'Saving…' : 'Save'}</button>
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
