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
		ownerId: string | null;
		ownerName: string | null;
		ownerEmail: string | null;
		taskTotal: number;
		taskCompleted: number;
		taskBlocked: number;
		completionPct: number;
	};

	type Task = {
		id: string;
		projectId: string;
		parentTaskId: string | null;
		name: string;
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
	};

	type Dep = { id: string; fromTaskId: string; toTaskId: string; kind: string };

	type Scale = 'day' | 'week' | 'month' | 'quarter';
	let scale = $state<Scale>('week');

	const PX_PER_DAY: Record<Scale, number> = {
		day: 32,
		week: 12,
		month: 4.2,
		quarter: 1.6
	};

	const fromMs = $derived(Date.parse(data.filters.from));
	const toMs = $derived(Date.parse(data.filters.to));
	const rangeDays = $derived(Math.max(1, Math.round((toMs - fromMs) / 86_400_000) + 1));
	const pxPerDay = $derived(PX_PER_DAY[scale]);
	const chartWidth = $derived(Math.max(420, rangeDays * pxPerDay));
	const ROW_HEIGHT = 38;
	const BAR_HEIGHT = 18;

	const dayOffset = (iso: string | null) => {
		if (!iso) return 0;
		const t = Date.parse(iso);
		if (Number.isNaN(t)) return 0;
		return Math.round((t - fromMs) / 86_400_000);
	};

	const todayIso = new Date().toISOString().slice(0, 10);
	const todayX = $derived(dayOffset(todayIso) * pxPerDay);

	// Build month / week ticks at the top of the chart so users can read dates.
	const ticks = $derived.by(() => {
		const out: Array<{ x: number; label: string; major: boolean }> = [];
		const startDate = new Date(fromMs);
		const endDate = new Date(toMs);

		if (scale === 'day' || scale === 'week') {
			const cursor = new Date(startDate);
			while (cursor.getTime() <= endDate.getTime()) {
				const offsetDays = Math.round((cursor.getTime() - fromMs) / 86_400_000);
				const isMonthStart = cursor.getDate() === 1;
				const isWeekStart = cursor.getDay() === 1;
				if (isMonthStart || (scale === 'day' && isWeekStart)) {
					out.push({
						x: offsetDays * pxPerDay,
						label: isMonthStart
							? cursor.toLocaleString('en-SG', { month: 'short', year: '2-digit' })
							: `${cursor.getDate()}`,
						major: isMonthStart
					});
				}
				cursor.setDate(cursor.getDate() + (scale === 'day' ? 1 : 7));
			}
		} else {
			const cursor = new Date(startDate);
			cursor.setDate(1);
			while (cursor.getTime() <= endDate.getTime()) {
				const offsetDays = Math.round((cursor.getTime() - fromMs) / 86_400_000);
				const isQuarterStart = cursor.getMonth() % 3 === 0;
				if (scale === 'quarter' ? isQuarterStart : true) {
					out.push({
						x: offsetDays * pxPerDay,
						label: cursor.toLocaleString('en-SG', { month: 'short', year: '2-digit' }),
						major: scale === 'quarter' ? isQuarterStart : cursor.getMonth() === 0
					});
				}
				cursor.setMonth(cursor.getMonth() + 1);
			}
		}
		return out;
	});

	const projects = $derived(data.projects as Project[]);

	// Drill-down state: which project rows are expanded, and the loaded task
	// set for each. Loads on demand to keep the initial page fast.
	let expandedProjectId = $state<string | null>(null);
	let projectTasks = $state<Record<string, { tasks: Task[]; deps: Dep[]; loading: boolean }>>({});
	let criticalPathSet = $state<Record<string, Set<string>>>({});

	async function toggleExpand(p: Project) {
		if (expandedProjectId === p.id) {
			expandedProjectId = null;
			return;
		}
		expandedProjectId = p.id;
		if (!projectTasks[p.id]) {
			projectTasks = { ...projectTasks, [p.id]: { tasks: [], deps: [], loading: true } };
			try {
				const [taskRes, pathRes] = await Promise.all([
					fetch(`/api/projects/${p.id}/tasks`).then((r) => r.json()),
					fetch(`/api/projects/${p.id}/critical-path`).then((r) => r.json())
				]);
				const tasks = (taskRes?.data?.tasks ?? taskRes?.tasks ?? []) as Task[];
				const deps = (taskRes?.data?.dependencies ?? taskRes?.dependencies ?? []) as Dep[];
				const cp = (pathRes?.data?.taskIds ?? pathRes?.taskIds ?? []) as string[];
				projectTasks = {
					...projectTasks,
					[p.id]: { tasks, deps, loading: false }
				};
				criticalPathSet = { ...criticalPathSet, [p.id]: new Set(cp) };
			} catch {
				projectTasks = {
					...projectTasks,
					[p.id]: { tasks: [], deps: [], loading: false }
				};
			}
		}
	}

	// Drag/resize state — a task being dragged or resized. We send a single
	// PATCH on drop so we don't spam the server during drag.
	type DragState = {
		taskId: string;
		projectId: string;
		mode: 'move' | 'resize-left' | 'resize-right';
		startX: number;
		originalStart: number;
		originalEnd: number;
	} | null;
	let drag = $state<DragState>(null);
	let dragDeltaDays = $state(0);

	function beginDrag(
		e: PointerEvent,
		mode: 'move' | 'resize-left' | 'resize-right',
		task: Task
	) {
		if (!task.startDate || !task.endDate) return;
		e.preventDefault();
		const target = e.currentTarget as Element;
		(target as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(
			e.pointerId
		);
		drag = {
			taskId: task.id,
			projectId: task.projectId,
			mode,
			startX: e.clientX,
			originalStart: Date.parse(task.startDate),
			originalEnd: Date.parse(task.endDate)
		};
		dragDeltaDays = 0;
	}

	function onPointerMove(e: PointerEvent) {
		if (!drag) return;
		const dx = e.clientX - drag.startX;
		dragDeltaDays = Math.round(dx / pxPerDay);
	}

	async function onPointerUp() {
		if (!drag) {
			return;
		}
		const days = dragDeltaDays;
		const d = drag;
		drag = null;
		dragDeltaDays = 0;
		if (days === 0) return;

		const ms = 86_400_000;
		let newStart = d.originalStart;
		let newEnd = d.originalEnd;
		if (d.mode === 'move') {
			newStart += days * ms;
			newEnd += days * ms;
		} else if (d.mode === 'resize-left') {
			newStart += days * ms;
			if (newStart >= newEnd) newStart = newEnd - ms;
		} else {
			newEnd += days * ms;
			if (newEnd <= newStart) newEnd = newStart + ms;
		}
		const startIso = new Date(newStart).toISOString().slice(0, 10);
		const endIso = new Date(newEnd).toISOString().slice(0, 10);

		try {
			const r = await fetch(`/api/projects/${d.projectId}/tasks/${d.taskId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ startDate: startIso, endDate: endIso })
			});
			if (r.ok) {
				const slot = projectTasks[d.projectId];
				if (slot) {
					projectTasks = {
						...projectTasks,
						[d.projectId]: {
							...slot,
							tasks: slot.tasks.map((t) =>
								t.id === d.taskId ? { ...t, startDate: startIso, endDate: endIso } : t
							)
						}
					};
				}
			}
		} catch {
			/* swallow — next refresh will resync */
		}
	}
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} />

<div class="space-y-5">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div class="min-w-0">
			<nav class="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
				<a class="hover:text-[var(--sf-green)] hover:underline" href="/projects">Projects</a>
				<span class="text-slate-300">/</span>
				<span class="text-slate-600">Gantt</span>
			</nav>
			<h1 class="text-xl font-medium text-slate-900">Portfolio Gantt</h1>
			<p class="mt-1 text-[13px] text-slate-600">
				One summary bar per project, coloured by deadline urgency. Click a row to expand its
				task timeline.
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<a
				href="/projects/dashboard"
				class="inline-flex items-center justify-center rounded-md border border-slate-300 px-3.5 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
			>
				Dashboard
			</a>
			<a
				href="/projects/calendar"
				class="inline-flex items-center justify-center rounded-md border border-slate-300 px-3.5 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
			>
				Calendar
			</a>
			<a
				href="/projects/new"
				class="inline-flex items-center justify-center rounded-md bg-[var(--sf-green)] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#2f5e2c]"
			>
				Create project
			</a>
		</div>
	</header>

	<!-- Toolbar -->
	<section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
		<div class="flex flex-wrap items-center justify-between gap-3 text-sm">
			<form method="GET" class="flex flex-wrap items-center gap-2" data-sveltekit-noscroll>
				<select
					name="scope"
					value={data.filters.scope}
					class="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
					onchange={(e) => (e.currentTarget.form as HTMLFormElement).submit()}
				>
					<option value="all">All projects</option>
					<option value="mine">Mine</option>
				</select>
				<label class="text-xs text-slate-500">From
					<input
						type="date"
						name="from"
						value={data.filters.from}
						class="ml-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
					/>
				</label>
				<label class="text-xs text-slate-500">To
					<input
						type="date"
						name="to"
						value={data.filters.to}
						class="ml-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
					/>
				</label>
				<button
					type="submit"
					class="rounded-md border border-[var(--sf-green)] bg-[var(--sf-green-soft)] px-3 py-1.5 text-xs font-medium text-[var(--sf-green)] hover:bg-emerald-100"
				>
					Apply
				</button>
			</form>

			<div class="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
				{#each ['day', 'week', 'month', 'quarter'] as const as opt}
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
	</section>

	<!-- Gantt -->
	<section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
		<div class="flex">
			<!-- Left column: project list -->
			<div class="w-64 shrink-0 border-r border-slate-200 bg-slate-50/50">
				<div class="h-10 border-b border-slate-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
					Project
				</div>
				{#each projects as p (p.id)}
					{@const urg = computeUrgency({
						status: p.status,
						startDate: p.startDate,
						deadline: p.deadline,
						createdAt: p.createdAt
					})}
					<button
						type="button"
						class="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-slate-100"
						style={`height:${ROW_HEIGHT}px`}
						onclick={() => toggleExpand(p)}
					>
						<div class="flex items-center gap-1.5">
							<span class="text-slate-400">{expandedProjectId === p.id ? '▼' : '▶'}</span>
							<span class="truncate font-medium text-slate-800">{p.name}</span>
							<span
								class="ml-auto h-2 w-2 shrink-0 rounded-full"
								style={`background:${urg.fill}`}
								title={urg.label}
							></span>
						</div>
						<p class="ml-4 truncate text-[10px] text-slate-500">
							{p.ownerName ?? p.ownerEmail ?? '— unassigned —'}
						</p>
					</button>
					{#if expandedProjectId === p.id && projectTasks[p.id]}
						{#each projectTasks[p.id].tasks as t (t.id)}
							<div
								class="border-b border-slate-100 px-3 py-1.5 pl-8 text-[11px]"
								style={`height:${ROW_HEIGHT}px`}
							>
								<p class="truncate font-medium text-slate-700">{t.name}</p>
								<p class="truncate text-[10px] text-slate-400">
									{t.assigneeName ?? '— unassigned —'}
								</p>
							</div>
						{/each}
					{/if}
				{/each}
			</div>

			<!-- Right column: chart -->
			<div class="min-w-0 flex-1 overflow-x-auto">
				<svg
					width={chartWidth}
					height={projects.reduce((acc, p) => {
						const own = ROW_HEIGHT;
						const taskRows =
							expandedProjectId === p.id && projectTasks[p.id]
								? projectTasks[p.id].tasks.length * ROW_HEIGHT
								: 0;
						return acc + own + taskRows;
					}, 40)}
					xmlns="http://www.w3.org/2000/svg"
					class="select-none"
				>
					<!-- Tick header -->
					<g>
						<rect x="0" y="0" width={chartWidth} height="40" fill="#f8fafc"></rect>
						{#each ticks as tick}
							<line
								x1={tick.x}
								x2={tick.x}
								y1="0"
								y2={ROW_HEIGHT * (projects.length + 6)}
								stroke={tick.major ? '#cbd5e1' : '#e2e8f0'}
								stroke-width={tick.major ? 1 : 0.5}
							></line>
							<text x={tick.x + 4} y={26} font-size="11" fill={tick.major ? '#475569' : '#94a3b8'}>
								{tick.label}
							</text>
						{/each}
						{#if todayX >= 0 && todayX <= chartWidth}
							<line
								x1={todayX}
								x2={todayX}
								y1="0"
								y2={ROW_HEIGHT * (projects.length + 6)}
								stroke="#16a34a"
								stroke-width="1.5"
								stroke-dasharray="4 2"
							></line>
							<text x={todayX + 4} y={14} font-size="10" fill="#16a34a" font-weight="600">
								Today
							</text>
						{/if}
					</g>

					<!-- Project bars -->
					{@const renderedRows = { y: 40 } as { y: number }}
					{#each projects as p (p.id)}
						{@const urg = computeUrgency({
							status: p.status,
							startDate: p.startDate,
							deadline: p.deadline,
							createdAt: p.createdAt
						})}
						{@const startDay = dayOffset(p.startDate ?? p.createdAt)}
						{@const endDay = dayOffset(p.deadline)}
						{@const x = Math.max(0, startDay * pxPerDay)}
						{@const w = Math.max(8, (endDay - startDay) * pxPerDay)}
						<g>
							<rect
								x="0"
								y={renderedRows.y}
								width={chartWidth}
								height={ROW_HEIGHT}
								fill={expandedProjectId === p.id ? '#f1f5f9' : 'transparent'}
							></rect>
							<a href={`/projects/${p.id}`}>
								<title>{p.name} — {urg.label}, {p.completionPct}% complete</title>
								<rect
									x={x}
									y={renderedRows.y + (ROW_HEIGHT - BAR_HEIGHT) / 2}
									width={w}
									height={BAR_HEIGHT}
									rx="4"
									fill={urg.soft}
									stroke={urg.border}
									stroke-width="1"
								></rect>
								<!-- inner progress -->
								<rect
									x={x}
									y={renderedRows.y + (ROW_HEIGHT - BAR_HEIGHT) / 2}
									width={Math.max(0, (w * p.completionPct) / 100)}
									height={BAR_HEIGHT}
									rx="4"
									fill={urg.fill}
									fill-opacity="0.8"
								></rect>
								<text
									x={x + 6}
									y={renderedRows.y + ROW_HEIGHT / 2 + 4}
									font-size="11"
									fill={urg.text}
									font-weight="600"
								>
									{p.name}
								</text>
							</a>
						</g>
						{(renderedRows.y += ROW_HEIGHT, '')}

						{#if expandedProjectId === p.id && projectTasks[p.id]}
							{#each projectTasks[p.id].tasks as t (t.id)}
								{@const tStart = dayOffset(t.startDate)}
								{@const tEnd = dayOffset(t.endDate)}
								{@const previewDays = drag && drag.taskId === t.id ? dragDeltaDays : 0}
								{@const tx =
									(tStart + (drag && drag.taskId === t.id && drag.mode === 'move' ? previewDays : drag && drag.taskId === t.id && drag.mode === 'resize-left' ? previewDays : 0)) *
									pxPerDay}
								{@const tw =
									Math.max(
										6,
										(tEnd -
											tStart +
											(drag && drag.taskId === t.id && drag.mode === 'resize-right' ? previewDays : 0) -
											(drag && drag.taskId === t.id && drag.mode === 'resize-left' ? previewDays : 0)) *
											pxPerDay
									)}
								{@const isCp = criticalPathSet[p.id]?.has(t.id) ?? false}
								<g>
									<rect
										x="0"
										y={renderedRows.y}
										width={chartWidth}
										height={ROW_HEIGHT}
										fill="#fafafa"
									></rect>
									{#if t.startDate && t.endDate}
										<g style="cursor: grab;">
											<rect
												x={tx}
												y={renderedRows.y + (ROW_HEIGHT - 14) / 2}
												width={tw}
												height="14"
												rx="3"
												fill={t.status === 'completed' ? '#bbf7d0' : isCp ? '#fef3c7' : '#e0f2fe'}
												stroke={isCp ? '#f59e0b' : '#7dd3fc'}
												stroke-width={isCp ? 1.5 : 1}
												onpointerdown={(e) => beginDrag(e, 'move', t)}
											></rect>
											<!-- resize handles -->
											<rect
												x={tx}
												y={renderedRows.y + (ROW_HEIGHT - 14) / 2}
												width="4"
												height="14"
												fill="transparent"
												style="cursor: ew-resize;"
												onpointerdown={(e) => beginDrag(e, 'resize-left', t)}
											></rect>
											<rect
												x={tx + tw - 4}
												y={renderedRows.y + (ROW_HEIGHT - 14) / 2}
												width="4"
												height="14"
												fill="transparent"
												style="cursor: ew-resize;"
												onpointerdown={(e) => beginDrag(e, 'resize-right', t)}
											></rect>
											<text
												x={tx + 4}
												y={renderedRows.y + ROW_HEIGHT / 2 + 4}
												font-size="10"
												fill={t.status === 'completed' ? '#166534' : isCp ? '#92400e' : '#0c4a6e'}
											>
												{t.name}
											</text>
										</g>
									{/if}
								</g>

								<!-- Dependency arrows: drawn from prerequisite END to dependent START -->
								{#each projectTasks[p.id].deps.filter((d) => d.toTaskId === t.id) as dep}
									{@const fromTask = projectTasks[p.id].tasks.find((x) => x.id === dep.fromTaskId)}
									{#if fromTask && fromTask.endDate && t.startDate}
										{@const fx = (dayOffset(fromTask.endDate) + 1) * pxPerDay}
										{@const fy =
											40 +
											ROW_HEIGHT *
												(projects.findIndex((q) => q.id === p.id) +
													projectTasks[p.id].tasks.findIndex((x) => x.id === fromTask.id) +
													1)}
										<path
											d={`M ${fx} ${fy + ROW_HEIGHT / 2} L ${fx + 8} ${fy + ROW_HEIGHT / 2} L ${fx + 8} ${renderedRows.y + ROW_HEIGHT / 2} L ${tx} ${renderedRows.y + ROW_HEIGHT / 2}`}
											fill="none"
											stroke="#94a3b8"
											stroke-width="1"
											stroke-dasharray="2 2"
										></path>
									{/if}
								{/each}

								{(renderedRows.y += ROW_HEIGHT, '')}
							{/each}
						{/if}
					{/each}
				</svg>
			</div>
		</div>
	</section>

	<p class="text-xs text-slate-500">
		Drag a task bar to move it; the small edges resize. Yellow outlines mark the critical path
		(longest chain in the task DAG).
	</p>
</div>
