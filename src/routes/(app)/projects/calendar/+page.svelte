<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	type Badge =
		| 'overdue'
		| 'blocked'
		| 'under_review'
		| 'milestone'
		| 'critical_path'
		| 'conflict'
		| 'qms_pending'
		| 'outsourced';

	type CalEvent = {
		id: string;
		taskId: string;
		projectId: string;
		projectName: string | null;
		stageId: string | null;
		stageName: string | null;
		stageColor: string | null;
		title: string;
		assigneeId: string | null;
		assigneeName: string | null;
		status: string;
		type: 'task_start' | 'task_due';
		date: string;
		dateMeaning: 'starts' | 'due' | 'overdue';
		taskType: string | null;
		kind: string;
		isMilestone: boolean;
		progressPct: number | null;
		badges: Badge[];
		urgency: {
			level: string;
			label: string;
			soft: string;
			text: string;
			fill: string;
			border: string;
			daysUntilDeadline: number | null;
		};
	};

	const todayIso = new Date().toISOString().slice(0, 10);

	const BADGE_META: Record<Badge, { label: string; cls: string }> = {
		overdue: { label: 'Overdue', cls: 'bg-rose-100 text-rose-700 ring-rose-200' },
		blocked: { label: 'Blocked', cls: 'bg-orange-100 text-orange-700 ring-orange-200' },
		under_review: { label: 'Under review', cls: 'bg-amber-100 text-amber-800 ring-amber-200' },
		milestone: { label: 'Milestone', cls: 'bg-violet-100 text-violet-700 ring-violet-200' },
		critical_path: { label: 'Critical path', cls: 'bg-yellow-100 text-yellow-800 ring-yellow-300' },
		conflict: { label: 'Conflict', cls: 'bg-red-100 text-red-700 ring-red-200' },
		qms_pending: { label: 'QMS pending', cls: 'bg-sky-100 text-sky-700 ring-sky-200' },
		outsourced: { label: 'Outsourced', cls: 'bg-slate-100 text-slate-600 ring-slate-200' }
	};

	const STATUS_LABEL: Record<string, string> = {
		unassigned: 'Unassigned',
		ongoing: 'Ongoing',
		under_review: 'Under review',
		completed: 'Completed',
		blocked: 'Blocked'
	};

	const events = $derived((data.events ?? []) as CalEvent[]);

	// ---- Client-side filters (instant, no reload) -------------------------
	let fMine = $state(false);
	let fProject = $state('');
	let fAssignee = $state('');
	let fStage = $state('');
	let fStatus = $state('');
	let fType = $state('');
	let fQuick = $state<'' | Badge | 'under_review' | 'blocked' | 'milestones'>('');

	function uniq<T>(rows: T[], key: (r: T) => string | null, label: (r: T) => string | null) {
		const map = new Map<string, string>();
		for (const r of rows) {
			const id = key(r);
			if (id) map.set(id, label(r) ?? id);
		}
		return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) =>
			a.name.localeCompare(b.name)
		);
	}

	const projectOptions = $derived(uniq(events, (e) => e.projectId, (e) => e.projectName));
	const assigneeOptions = $derived(uniq(events, (e) => e.assigneeId, (e) => e.assigneeName));
	const stageOptions = $derived(uniq(events, (e) => e.stageId, (e) => e.stageName));
	const typeOptions = $derived(
		[...new Set(events.map((e) => e.taskType).filter(Boolean) as string[])].sort()
	);

	const filtered = $derived(
		events.filter((e) => {
			if (fMine && e.assigneeId !== data.currentUserId) return false;
			if (fProject && e.projectId !== fProject) return false;
			if (fAssignee && e.assigneeId !== fAssignee) return false;
			if (fStage && e.stageId !== fStage) return false;
			if (fStatus && e.status !== fStatus) return false;
			if (fType && e.taskType !== fType) return false;
			if (fQuick) {
				if (fQuick === 'milestones') return e.isMilestone;
				if (fQuick === 'under_review') return e.status === 'under_review';
				if (fQuick === 'blocked') return e.status === 'blocked';
				return e.badges.includes(fQuick as Badge);
			}
			return true;
		})
	);

	const activeFilterCount = $derived(
		[fMine, fProject, fAssignee, fStage, fStatus, fType, fQuick].filter(Boolean).length
	);
	function clearFilters() {
		fMine = false;
		fProject = '';
		fAssignee = '';
		fStage = '';
		fStatus = '';
		fType = '';
		fQuick = '';
	}

	// ---- View navigation --------------------------------------------------
	function buildHref(params: Record<string, string>) {
		const sp = new URLSearchParams();
		for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
		const qs = sp.toString();
		return `/projects/calendar${qs ? `?${qs}` : ''}`;
	}
	const viewHref = (view: string) =>
		buildHref({ view, date: data.anchor, month: `${data.month.year}-${String(data.month.month + 1).padStart(2, '0')}` });

	function shiftIso(iso: string, days: number) {
		const d = new Date(`${iso}T00:00:00Z`);
		d.setUTCDate(d.getUTCDate() + days);
		return d.toISOString().slice(0, 10);
	}
	const monthHref = (year: number, month: number) =>
		buildHref({ view: 'month', month: `${year}-${String(month + 1).padStart(2, '0')}` });
	const prevMonthHref = $derived.by(() => {
		const d = new Date(Date.UTC(data.month.year, data.month.month - 1, 1));
		return monthHref(d.getUTCFullYear(), d.getUTCMonth());
	});
	const nextMonthHref = $derived.by(() => {
		const d = new Date(Date.UTC(data.month.year, data.month.month + 1, 1));
		return monthHref(d.getUTCFullYear(), d.getUTCMonth());
	});

	const monthLabel = $derived.by(() => {
		const d = new Date(Date.UTC(data.month.year, data.month.month, 1));
		return d.toLocaleString('en-SG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
	});
	const weekLabel = $derived.by(() => {
		if (!data.range.from) return '';
		const from = new Date(`${data.range.from}T00:00:00Z`);
		const to = new Date(`${data.range.to}T00:00:00Z`);
		const f = from.toLocaleString('en-SG', { month: 'short', day: 'numeric', timeZone: 'UTC' });
		const t = to.toLocaleString('en-SG', { month: 'short', day: 'numeric', timeZone: 'UTC' });
		return `${f} – ${t}`;
	});

	// Group filtered events by ISO day for week / month rendering.
	const dayMap = $derived.by(() => {
		const map = new Map<string, CalEvent[]>();
		for (const e of filtered) {
			const list = map.get(e.date) ?? [];
			list.push(e);
			map.set(e.date, list);
		}
		return map;
	});

	// Week cells (7 days from range.from).
	const weekDays = $derived.by(() => {
		if (!data.range.from) return [] as Array<{ iso: string; label: string; weekday: string }>;
		const out: Array<{ iso: string; label: string; weekday: string }> = [];
		for (let i = 0; i < 7; i++) {
			const iso = shiftIso(data.range.from, i);
			const d = new Date(`${iso}T00:00:00Z`);
			out.push({
				iso,
				label: d.toLocaleString('en-SG', { day: 'numeric', timeZone: 'UTC' }),
				weekday: d.toLocaleString('en-SG', { weekday: 'short', timeZone: 'UTC' })
			});
		}
		return out;
	});

	// Month grid (6×7).
	const monthCells = $derived.by(() => {
		const first = new Date(Date.UTC(data.month.year, data.month.month, 1));
		const firstWeekday = first.getUTCDay();
		const daysInMonth = new Date(Date.UTC(data.month.year, data.month.month + 1, 0)).getUTCDate();
		const out: Array<{ iso: string | null; day: number | null; isWeekend: boolean }> = [];
		for (let i = 0; i < firstWeekday; i++)
			out.push({ iso: null, day: null, isWeekend: i === 0 || i === 6 });
		for (let d = 1; d <= daysInMonth; d++) {
			const iso = `${data.month.year}-${String(data.month.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			const wd = new Date(`${iso}T00:00:00Z`).getUTCDay();
			out.push({ iso, day: d, isWeekend: wd === 0 || wd === 6 });
		}
		while (out.length < 42) {
			const wd = out.length % 7;
			out.push({ iso: null, day: null, isWeekend: wd === 0 || wd === 6 });
		}
		return out;
	});

	// Agenda buckets relative to today.
	const agenda = $derived.by(() => {
		const buckets: Array<{ key: string; label: string; items: CalEvent[] }> = [
			{ key: 'overdue', label: 'Overdue', items: [] },
			{ key: 'today', label: 'Today', items: [] },
			{ key: 'tomorrow', label: 'Tomorrow', items: [] },
			{ key: 'week', label: 'Later this week', items: [] },
			{ key: 'later', label: 'Later', items: [] }
		];
		const tomorrow = shiftIso(todayIso, 1);
		const weekEnd = shiftIso(todayIso, 7);
		for (const e of filtered) {
			if (e.badges.includes('overdue') || (e.date < todayIso && e.dateMeaning !== 'starts')) {
				buckets[0].items.push(e);
			} else if (e.date === todayIso) buckets[1].items.push(e);
			else if (e.date === tomorrow) buckets[2].items.push(e);
			else if (e.date > tomorrow && e.date <= weekEnd) buckets[3].items.push(e);
			else if (e.date > weekEnd) buckets[4].items.push(e);
		}
		for (const b of buckets) b.items.sort((a, c) => (a.date < c.date ? -1 : a.date > c.date ? 1 : 0));
		return buckets.filter((b) => b.items.length > 0);
	});

	// Eyebrow stats.
	const stats = $derived({
		total: filtered.length,
		overdue: filtered.filter((e) => e.badges.includes('overdue')).length,
		underReview: filtered.filter((e) => e.status === 'under_review').length,
		blocked: filtered.filter((e) => e.status === 'blocked').length
	});

	// ---- Lightweight reschedule (single task due date) --------------------
	let reschedId = $state<string | null>(null);
	let reschedDate = $state('');
	let reschedReason = $state('');
	let reschedBusy = $state(false);
	let reschedError = $state<string | null>(null);

	function openReschedule(e: CalEvent) {
		reschedId = e.id;
		reschedDate = e.date;
		reschedReason = '';
		reschedError = null;
	}
	function closeReschedule() {
		reschedId = null;
		reschedError = null;
	}
	async function submitReschedule(e: CalEvent) {
		if (!reschedDate) {
			reschedError = 'Pick a new date.';
			return;
		}
		reschedBusy = true;
		reschedError = null;
		try {
			const res = await fetch(`/api/projects/${e.projectId}/tasks/${e.taskId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ endDate: reschedDate, rescheduleReason: reschedReason || null })
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error ?? `Reschedule failed (${res.status}).`);
			}
			closeReschedule();
			await invalidateAll();
		} catch (err) {
			reschedError = (err as Error).message;
		} finally {
			reschedBusy = false;
		}
	}

	const icsHref = $derived(`/api/projects/calendar?format=ics&from=${data.range.from}&to=${data.range.to}`);

	const VIEWS: Array<{ id: string; label: string }> = [
		{ id: 'agenda', label: 'Agenda' },
		{ id: 'week', label: 'Week' },
		{ id: 'month', label: 'Month' }
	];
</script>

{#snippet eventCard(e: CalEvent)}
	<div
		class="rounded-lg border bg-white p-2.5 shadow-sm"
		style={`border-color:${e.urgency.border}`}
	>
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0">
				<div class="flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
					<span class="rounded bg-slate-100 px-1 py-0.5 font-medium text-slate-600">
						{e.projectName ?? 'Project'}
					</span>
					{#if e.stageName}
						<span
							class="rounded px-1 py-0.5"
							style={e.stageColor ? `background:${e.stageColor}22;color:${e.stageColor}` : ''}
						>
							{e.stageName}
						</span>
					{/if}
				</div>
				<p class="mt-0.5 truncate text-[13px] font-medium text-slate-800" title={e.title}>
					{#if e.isMilestone}<span class="text-violet-500">◆ </span>{/if}{e.title}
				</p>
				<p class="mt-0.5 text-[11px] text-slate-500">
					{e.assigneeName ?? '— unassigned —'} ·
					<span style={`color:${e.urgency.text}`}>
						{e.dateMeaning === 'starts' ? 'Starts' : e.dateMeaning === 'overdue' ? 'Overdue' : 'Due'}
						{e.date}
					</span>
					· {STATUS_LABEL[e.status] ?? e.status}
				</p>
			</div>
		</div>

		{#if e.badges.length > 0}
			<div class="mt-1.5 flex flex-wrap gap-1">
				{#each e.badges as b}
					<span class={`rounded px-1.5 py-0.5 text-[9.5px] font-medium ring-1 ${BADGE_META[b].cls}`}>
						{BADGE_META[b].label}
					</span>
				{/each}
			</div>
		{/if}

		<div class="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
			<a class="text-[var(--sf-green)] hover:underline" href={`/employee/workplace/${e.taskId}`}>
				WorkPlace
			</a>
			<a class="text-slate-500 hover:underline" href={`/projects/${e.projectId}/tasks`}>Gantt</a>
			<a class="text-slate-500 hover:underline" href={`/projects/${e.projectId}`}>Project</a>
			{#if e.badges.includes('critical_path') || e.badges.includes('conflict')}
				<a
					class="ml-auto text-amber-700 hover:underline"
					href={`/projects/${e.projectId}/tasks`}
					title="This task is on the critical path or has a conflict — reschedule in the Gantt to review downstream impact."
				>
					Reschedule in Gantt →
				</a>
			{:else if reschedId === e.id}
				<span class="ml-auto"></span>
			{:else}
				<button
					type="button"
					class="ml-auto text-slate-500 hover:text-slate-800 hover:underline"
					onclick={() => openReschedule(e)}
				>
					Reschedule
				</button>
			{/if}
		</div>

		{#if reschedId === e.id}
			<div class="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
				<div class="flex flex-wrap items-center gap-2">
					<input
						type="date"
						class="rounded border border-slate-300 px-2 py-1 text-[12px]"
						bind:value={reschedDate}
					/>
					<input
						type="text"
						placeholder="Reason (optional)"
						class="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-[12px]"
						bind:value={reschedReason}
					/>
				</div>
				{#if reschedError}
					<p class="mt-1 text-[11px] text-rose-600">{reschedError}</p>
				{/if}
				<div class="mt-2 flex items-center gap-2">
					<button
						type="button"
						class="rounded bg-[var(--sf-green)] px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
						disabled={reschedBusy}
						onclick={() => submitReschedule(e)}
					>
						{reschedBusy ? 'Saving…' : 'Save'}
					</button>
					<button
						type="button"
						class="rounded border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600"
						onclick={closeReschedule}
					>
						Cancel
					</button>
				</div>
			</div>
		{/if}
	</div>
{/snippet}

{#snippet chip(e: CalEvent)}
	<a
		href={`/employee/workplace/${e.taskId}`}
		class="block truncate rounded border px-1.5 py-1 text-[10.5px] leading-tight"
		style={`background:${e.urgency.soft};color:${e.urgency.text};border-color:${e.urgency.border}`}
		title={`${e.projectName ?? ''} · ${e.title} · ${e.dateMeaning} ${e.date}`}
	>
		{#if e.isMilestone}◆ {/if}{e.title}
		{#if e.badges.includes('overdue')}<span class="font-semibold"> !</span>{/if}
	</a>
{/snippet}

<div class="space-y-5">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div class="min-w-0">
			<nav class="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
				<a class="hover:text-[var(--sf-green)] hover:underline" href="/projects">Projects</a>
				<span class="text-slate-300">/</span>
				<span class="text-slate-600">Calendar</span>
			</nav>
			<h1 class="text-xl font-medium text-slate-900">Project Task Calendar</h1>
			<p class="mt-1 text-[13px] text-slate-600">
				Daily &amp; weekly execution view — what starts, is due, overdue, under review, blocked or
				on the critical path. Planning lives in the Gantt; personal submission in WorkPlace.
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<a
				href="/projects/gantt"
				class="inline-flex items-center justify-center rounded-md border border-slate-300 px-3.5 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
			>
				Gantt
			</a>
			<a
				href={icsHref}
				class="inline-flex items-center justify-center rounded-md border border-[var(--sf-gold)] bg-[var(--sf-gold-soft)] px-3.5 py-2 text-[13px] font-medium text-[#7a5a07] hover:bg-[#f6e8b8]"
			>
				.ics
			</a>
		</div>
	</header>

	<!-- KPI strip -->
	<section class="grid grid-cols-2 gap-4 md:grid-cols-4">
		<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Events shown</p>
			<p class="mt-1 text-2xl font-semibold text-slate-900">{stats.total}</p>
		</article>
		<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Overdue</p>
			<p class="mt-1 text-2xl font-semibold {stats.overdue > 0 ? 'text-rose-600' : 'text-slate-900'}">
				{stats.overdue}
			</p>
		</article>
		<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Under review</p>
			<p class="mt-1 text-2xl font-semibold text-slate-900">{stats.underReview}</p>
		</article>
		<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Blocked</p>
			<p class="mt-1 text-2xl font-semibold text-slate-900">{stats.blocked}</p>
		</article>
	</section>

	<!-- Toolbar: view switch + nav + filters -->
	<section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
				{#each VIEWS as v}
					<a
						href={viewHref(v.id)}
						class={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
							data.view === v.id
								? 'bg-white text-slate-900 shadow-sm'
								: 'text-slate-500 hover:text-slate-700'
						}`}
					>
						{v.label}
					</a>
				{/each}
			</div>

			<div class="flex items-center gap-2">
				{#if data.view === 'month'}
					<a class="inline-flex h-8 items-center rounded-md border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50" href={prevMonthHref} aria-label="Previous month">←</a>
					<span class="px-1 text-sm font-semibold text-slate-900">{monthLabel}</span>
					<a class="inline-flex h-8 items-center rounded-md border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50" href={nextMonthHref} aria-label="Next month">→</a>
				{:else if data.view === 'week'}
					<a class="inline-flex h-8 items-center rounded-md border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50" href={buildHref({ view: 'week', date: shiftIso(data.anchor, -7) })} aria-label="Previous week">←</a>
					<span class="px-1 text-sm font-semibold text-slate-900">{weekLabel}</span>
					<a class="inline-flex h-8 items-center rounded-md border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50" href={buildHref({ view: 'week', date: shiftIso(data.anchor, 7) })} aria-label="Next week">→</a>
				{/if}
				<a class="inline-flex h-8 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 hover:bg-slate-100" href={buildHref({ view: data.view })}>Today</a>
			</div>
		</div>

		<!-- Quick filters -->
		<div class="mt-3 flex flex-wrap items-center gap-1.5">
			{#each [['', 'All'], ['mine', 'My tasks'], ['overdue', 'Overdue'], ['under_review', 'Under review'], ['blocked', 'Blocked'], ['milestones', 'Milestones'], ['critical_path', 'Critical path'], ['conflict', 'Conflict'], ['qms_pending', 'QMS pending']] as opt}
				{@const key = opt[0]}
				{@const active = key === '' ? activeFilterCount === 0 : key === 'mine' ? fMine : fQuick === key}
				<button
					type="button"
					class={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
						active
							? 'bg-[var(--sf-green)] text-white ring-[var(--sf-green)]'
							: 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
					}`}
					onclick={() => {
						if (key === '') {
							clearFilters();
						} else if (key === 'mine') {
							fMine = !fMine;
						} else {
							fQuick = fQuick === key ? '' : (key as typeof fQuick);
						}
					}}
				>
					{opt[1]}
				</button>
			{/each}
		</div>

		<!-- Advanced filters -->
		<div class="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
			<select bind:value={fProject} class="rounded border border-slate-300 px-2 py-1">
				<option value="">All projects</option>
				{#each projectOptions as o}<option value={o.id}>{o.name}</option>{/each}
			</select>
			<select bind:value={fAssignee} class="rounded border border-slate-300 px-2 py-1">
				<option value="">All assignees</option>
				{#each assigneeOptions as o}<option value={o.id}>{o.name}</option>{/each}
			</select>
			<select bind:value={fStage} class="rounded border border-slate-300 px-2 py-1">
				<option value="">All stages</option>
				{#each stageOptions as o}<option value={o.id}>{o.name}</option>{/each}
			</select>
			<select bind:value={fStatus} class="rounded border border-slate-300 px-2 py-1">
				<option value="">Any status</option>
				{#each Object.entries(STATUS_LABEL) as [v, l]}<option value={v}>{l}</option>{/each}
			</select>
			{#if typeOptions.length > 0}
				<select bind:value={fType} class="rounded border border-slate-300 px-2 py-1">
					<option value="">Any type</option>
					{#each typeOptions as t}<option value={t}>{t}</option>{/each}
				</select>
			{/if}
			{#if activeFilterCount > 0}
				<button type="button" class="text-[11px] text-slate-500 hover:underline" onclick={clearFilters}>
					Clear ({activeFilterCount})
				</button>
			{/if}
		</div>
	</section>

	{#if data.dataMessage}
		<div class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
			⚠ {data.dataMessage}
		</div>
	{/if}

	<!-- ===== AGENDA ===== -->
	{#if data.view === 'agenda'}
		{#if agenda.length === 0}
			<p class="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
				No tasks in this window.
			</p>
		{:else}
			<div class="space-y-5">
				{#each agenda as bucket}
					<section>
						<h3 class="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide {bucket.key === 'overdue' ? 'text-rose-600' : 'text-slate-500'}">
							{bucket.label}
							<span class="rounded-full bg-slate-100 px-1.5 text-[10px] font-medium text-slate-500">{bucket.items.length}</span>
						</h3>
						<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{#each bucket.items as e (e.id)}
								{@render eventCard(e)}
							{/each}
						</div>
					</section>
				{/each}
			</div>
		{/if}

	<!-- ===== WEEK ===== -->
	{:else if data.view === 'week'}
		<section class="grid grid-cols-1 gap-3 md:grid-cols-7">
			{#each weekDays as d}
				<div class="rounded-xl border border-slate-200 bg-white shadow-sm {d.iso === todayIso ? 'ring-2 ring-[var(--sf-green)]' : ''}">
					<div class="border-b border-slate-100 px-2.5 py-2">
						<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">{d.weekday}</p>
						<p class="text-sm font-semibold {d.iso === todayIso ? 'text-[var(--sf-green)]' : 'text-slate-700'}">{d.label}</p>
					</div>
					<div class="space-y-2 p-2">
						{#each (dayMap.get(d.iso) ?? []) as e (e.id)}
							{@render eventCard(e)}
						{/each}
						{#if (dayMap.get(d.iso) ?? []).length === 0}
							<p class="px-1 py-3 text-center text-[11px] text-slate-300">—</p>
						{/if}
					</div>
				</div>
			{/each}
		</section>

	<!-- ===== MONTH ===== -->
	{:else}
		<section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			<div class="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
				{#each ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as wd}
					<div class="py-2.5">{wd}</div>
				{/each}
			</div>
			<div class="grid grid-cols-7">
				{#each monthCells as cell}
					<div
						class="relative min-h-[116px] border-b border-r border-slate-100 p-2 text-[11px] {cell.iso
							? cell.isWeekend
								? 'bg-slate-50/40'
								: ''
							: 'bg-slate-50/70'}"
						class:bg-[var(--sf-green-soft)]={cell.iso === todayIso}
					>
						{#if cell.day !== null}
							<div class="mb-1.5 flex items-center justify-between">
								<span class="text-xs font-semibold {cell.iso === todayIso ? 'text-[var(--sf-green)]' : 'text-slate-700'}">{cell.day}</span>
								{#if cell.iso === todayIso}
									<span class="rounded-full bg-[var(--sf-green)] px-1.5 py-0.5 text-[9px] font-medium text-white">Today</span>
								{/if}
							</div>
							{@const dayEvents = cell.iso ? (dayMap.get(cell.iso) ?? []) : []}
							{#if dayEvents.length > 0}
								<ul class="space-y-1">
									{#each dayEvents.slice(0, 3) as e (e.id)}
										<li>{@render chip(e)}</li>
									{/each}
									{#if dayEvents.length > 3}
										<li class="px-1.5 text-[10px] text-slate-500">+ {dayEvents.length - 3} more</li>
									{/if}
								</ul>
							{/if}
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Two-way sync (kept; ICS exports project-level deadlines) -->
	<section class="rounded-xl border border-slate-200 bg-white p-4 text-xs">
		<p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">External calendar sync</p>
		<p class="mt-1 text-slate-600">
			Connect Google / Outlook to subscribe to project deadlines. Task-level sync is not enabled yet —
			use the in-app views above for execution.
		</p>
		<div class="mt-3 grid gap-2 sm:grid-cols-2">
			{#each data.integrations ?? [] as int}
				<div class="rounded-md border border-slate-200 bg-slate-50/50 p-3">
					<p class="text-sm font-medium capitalize text-slate-800">{int.provider}</p>
					{#if !int.configured}
						<p class="mt-1 text-[11px] text-amber-700">Operator setup required to enable.</p>
					{:else if int.connected}
						<p class="mt-1 text-[11px] text-slate-600">Connected as <span class="font-mono">{int.externalAccountEmail}</span></p>
						<form method="POST" action={`/api/projects/calendar/oauth/${int.provider}/disconnect`} class="mt-2">
							<button type="submit" class="rounded-md border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50">Disconnect</button>
						</form>
					{:else}
						<a class="mt-2 inline-flex rounded-md border border-[var(--sf-green)] bg-[var(--sf-green-soft)] px-2 py-1 text-[11px] font-medium text-[var(--sf-green)] hover:bg-emerald-100" href={`/api/projects/calendar/oauth/${int.provider}/start`}>Connect {int.provider}</a>
					{/if}
				</div>
			{/each}
		</div>
	</section>
</div>
