<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { computeUrgency } from '$modules/project';

	let { data } = $props();

	type StatusRow = { status: string; count: number };
	type DeadlineRow = {
		id: string;
		name: string;
		status: string;
		deadline: string | null;
		priority: number;
		startDate?: string | null;
		ownerEmail: string | null;
		ownerName: string | null;
	};

	const STATUS_PALETTE: Record<string, { fill: string; soft: string; text: string; label: string }> = {
		unassigned: { fill: '#94a3b8', soft: '#f1f5f9', text: '#475569', label: 'Unassigned' },
		ongoing: { fill: '#1e88e5', soft: '#e0f2fe', text: '#0c4a6e', label: 'Ongoing' },
		under_review: { fill: '#f59e0b', soft: '#fef3c7', text: '#92400e', label: 'Under Review' },
		completed: { fill: '#16a34a', soft: '#dcfce7', text: '#166534', label: 'Completed' },
		active: { fill: '#0f9d58', soft: '#dcfce7', text: '#166534', label: 'Active (legacy)' },
		on_hold: { fill: '#fb923c', soft: '#ffedd5', text: '#9a3412', label: 'On Hold' },
		archived: { fill: '#64748b', soft: '#e2e8f0', text: '#334155', label: 'Archived' }
	};
	const statusMeta = (status: string) =>
		STATUS_PALETTE[status] ?? { fill: '#cbd5e1', soft: '#f1f5f9', text: '#475569', label: status };

	// Auto-urgency (TKMGMT-v2): the colour is derived from the deadline, never
	// from a user-entered priority number. Keeps the dashboard, list, calendar,
	// and Gantt in lock-step.
	const urgencyOf = (p: DeadlineRow) =>
		computeUrgency({
			status: p.status,
			deadline: p.deadline,
			startDate: p.startDate ?? null
		});

	const totalStatusCount = $derived(
		(data.dashboard.statusSummary ?? []).reduce(
			(acc: number, r: StatusRow) => acc + r.count,
			0
		)
	);

	const completedCount = $derived(
		((data.dashboard.statusSummary ?? []) as StatusRow[]).find((r) => r.status === 'completed')
			?.count ?? 0
	);
	const activeCount = $derived(
		((data.dashboard.statusSummary ?? []) as StatusRow[])
			.filter((r) => r.status === 'ongoing' || r.status === 'under_review' || r.status === 'active')
			.reduce((acc, r) => acc + r.count, 0)
	);
	const unassignedCount = $derived(
		((data.dashboard.statusSummary ?? []) as StatusRow[]).find((r) => r.status === 'unassigned')
			?.count ?? 0
	);

	type PieSeg = { status: string; count: number; pct: number; meta: ReturnType<typeof statusMeta> };
	const pieSegments = $derived.by<PieSeg[]>(() => {
		const total = totalStatusCount;
		if (total === 0) return [];
		return (data.dashboard.statusSummary as StatusRow[]).map((r) => ({
			status: r.status,
			count: r.count,
			pct: (r.count / total) * 100,
			meta: statusMeta(r.status)
		}));
	});

	const conicGradient = $derived.by(() => {
		if (pieSegments.length === 0) return '#e2e8f0';
		let acc = 0;
		const parts = pieSegments.map((s) => {
			const start = acc;
			acc += s.pct;
			return `${s.meta.fill} ${start}% ${acc}%`;
		});
		return `conic-gradient(${parts.join(', ')})`;
	});

	// TKMGMT10 — Dashboard auto-refreshes so numbers don't drift. The "last
	// refreshed at" label is purely derived from the server payload, which
	// changes whenever invalidateAll() reloads the page data.
	let refreshTimer: ReturnType<typeof setInterval> | null = null;
	const lastRefreshedAt = $derived(new Date(data.dashboard.generatedAt));

	onMount(() => {
		refreshTimer = setInterval(() => {
			invalidateAll();
		}, 60_000);
		return () => {
			if (refreshTimer) clearInterval(refreshTimer);
		};
	});

	// AI exec summary (Epic 9). Fetched lazily so a slow LLM never blocks
	// the dashboard from rendering.
	type ExecSummary = {
		headline: string;
		insights: string[];
		risks: Array<{ title: string; severity: 'low' | 'medium' | 'high' }>;
	};
	let execSummary = $state<ExecSummary | null>(null);
	let execLoading = $state(false);
	let execError = $state<string | null>(null);

	async function loadExecSummary() {
		execLoading = true;
		execError = null;
		try {
			const r = await fetch('/api/projects/dashboard/summary');
			const body: any = await r.json();
			const summary = body?.data?.summary ?? body?.summary;
			if (!summary) {
				execError = body?.error ?? 'Summary unavailable.';
				return;
			}
			execSummary = summary;
		} catch (e) {
			execError = (e as Error).message;
		} finally {
			execLoading = false;
		}
	}

	const todayIso = new Date().toISOString().slice(0, 10);
	const daysFromToday = (deadline: string | null) => {
		if (!deadline) return 0;
		const a = new Date(`${deadline}T00:00:00Z`);
		const b = new Date(`${todayIso}T00:00:00Z`);
		if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
		return Math.round((a.getTime() - b.getTime()) / 86_400_000);
	};
	const formatRelative = (days: number) => {
		if (days === 0) return 'Due today';
		if (days === 1) return 'Due tomorrow';
		if (days > 0) return `in ${days} days`;
		if (days === -1) return '1 day overdue';
		return `${Math.abs(days)} days overdue`;
	};

	function manualRefresh() {
		invalidateAll();
	}
</script>

<div class="space-y-5">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div class="min-w-0">
			<nav class="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
				<a class="hover:text-[var(--sf-green)] hover:underline" href="/projects">Projects</a>
				<span class="text-slate-300">/</span>
				<span class="text-slate-600">Dashboard</span>
			</nav>
			<h1 class="text-xl font-medium text-slate-900">Project Dashboard</h1>
			<p class="mt-1 text-[13px] text-slate-600">
				Status mix, the next 5 deadlines and anything past its due date — refreshed every minute.
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<a
				href="/projects/calendar"
				class="inline-flex items-center justify-center rounded-md border border-slate-300 px-3.5 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
			>
				Calendar
			</a>
			<button
				type="button"
				onclick={manualRefresh}
				class="inline-flex items-center justify-center rounded-md border border-[var(--sf-green)] bg-[var(--sf-green-soft)] px-3.5 py-2 text-[13px] font-medium text-[var(--sf-green)] hover:bg-emerald-100"
			>
				Refresh now
			</button>
			<a
				href="/projects/new"
				class="inline-flex items-center justify-center rounded-md bg-[var(--sf-green)] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#2f5e2c]"
			>
				Create project
			</a>
		</div>
	</header>

	<!-- AI exec summary banner (Epic 9) -->
	<section class="rounded-xl border border-[var(--sf-green)] bg-[var(--sf-green-soft)] p-4 shadow-sm">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0 flex-1">
				<p class="text-[11px] font-semibold uppercase tracking-wide text-[var(--sf-green)]">
					AI brief
				</p>
				{#if execSummary}
					<p class="mt-1 text-sm font-medium text-slate-900">{execSummary.headline}</p>
					{#if execSummary.insights.length > 0}
						<ul class="mt-2 list-disc pl-5 text-[13px] text-slate-700">
							{#each execSummary.insights as ins}
								<li>{ins}</li>
							{/each}
						</ul>
					{/if}
					{#if execSummary.risks.length > 0}
						<div class="mt-3 flex flex-wrap gap-2">
							{#each execSummary.risks as r}
								<span
									class="rounded-full px-2 py-0.5 text-[11px] font-medium"
									style={r.severity === 'high'
										? 'background:#fee2e2;color:#991b1b'
										: r.severity === 'medium'
										? 'background:#fef3c7;color:#92400e'
										: 'background:#dcfce7;color:#166534'}
								>
									{r.severity.toUpperCase()} · {r.title}
								</span>
							{/each}
						</div>
					{/if}
				{:else if execLoading}
					<p class="mt-1 text-sm text-slate-500">Asking the AI for a brief…</p>
				{:else if execError}
					<p class="mt-1 text-[12px] text-rose-700">{execError}</p>
				{:else}
					<p class="mt-1 text-[12px] text-slate-600">
						One-paragraph executive overview with risk callouts.
					</p>
				{/if}
			</div>
			<button
				type="button"
				class="rounded-md border border-[var(--sf-green)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--sf-green)] hover:bg-emerald-50"
				disabled={execLoading}
				onclick={loadExecSummary}
			>
				{execSummary ? 'Refresh' : 'Generate'}
			</button>
		</div>
	</section>

	<!-- KPI strip -->
	<section class="grid grid-cols-2 gap-4 md:grid-cols-4">
		<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Total projects</p>
			<p class="mt-1 text-2xl font-semibold text-slate-900">{totalStatusCount}</p>
			<p class="mt-1 text-[11px] text-slate-500">across all statuses</p>
		</article>
		<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Active</p>
			<p class="mt-1 text-2xl font-semibold text-slate-900">{activeCount}</p>
			<p class="mt-1 text-[11px] text-slate-500">ongoing + under review</p>
		</article>
		<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Unassigned</p>
			<p class="mt-1 text-2xl font-semibold text-slate-900">{unassignedCount}</p>
			<p class="mt-1 text-[11px] text-slate-500">awaiting an owner</p>
		</article>
		<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Overdue</p>
			<p
				class="mt-1 text-2xl font-semibold {data.dashboard.overdue.length > 0 ? 'text-rose-600' : 'text-slate-900'}"
			>
				{data.dashboard.overdue.length}
			</p>
			<p class="mt-1 text-[11px] text-slate-500">past deadline · not completed</p>
		</article>
	</section>

	<!-- Status mix + Upcoming -->
	<section class="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
		<article class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
			<div class="flex items-start justify-between gap-3">
				<div>
					<h2 class="text-sm font-semibold text-slate-800">Status mix</h2>
					<p class="mt-0.5 text-xs text-slate-500">
						Counts across {totalStatusCount} project{totalStatusCount === 1 ? '' : 's'}.
					</p>
				</div>
				<span class="rounded-full bg-[var(--sf-green-soft)] px-2 py-1 text-xs font-medium text-[var(--sf-green)]">
					{completedCount} completed
				</span>
			</div>

			{#if totalStatusCount === 0}
				<p class="mt-8 text-center text-sm text-slate-500">
					No projects yet — create one to populate the dashboard.
				</p>
			{:else}
				<div class="mt-5 flex flex-wrap items-center gap-6">
					<div
						class="relative h-40 w-40 shrink-0 rounded-full shadow-inner"
						style={`background:${conicGradient}`}
					>
						<div class="absolute inset-6 flex flex-col items-center justify-center rounded-full bg-white shadow-sm">
							<span class="text-[10px] uppercase tracking-wide text-slate-400">Total</span>
							<span class="text-xl font-semibold text-slate-900">{totalStatusCount}</span>
						</div>
					</div>
					<ul class="flex-1 space-y-2 text-sm">
						{#each pieSegments as seg}
							<li class="flex items-center gap-3">
								<span class="h-3 w-3 rounded-sm" style={`background:${seg.meta.fill}`}></span>
								<span class="flex-1 text-slate-700">{seg.meta.label}</span>
								<span class="text-slate-500">{seg.count}</span>
								<span class="w-10 text-right text-xs text-slate-400">{seg.pct.toFixed(0)}%</span>
							</li>
						{/each}
					</ul>
				</div>

				<div class="mt-6 space-y-2 border-t border-slate-100 pt-4">
					<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">
						Distribution
					</p>
					{#each pieSegments as seg}
						<div class="flex items-center gap-3 text-xs">
							<span class="w-28 shrink-0 font-medium text-slate-600">{seg.meta.label}</span>
							<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
								<div class="h-full" style={`background:${seg.meta.fill};width:${seg.pct}%`}></div>
							</div>
							<span class="w-10 shrink-0 text-right text-slate-500">{seg.count}</span>
						</div>
					{/each}
				</div>
			{/if}
		</article>

		<article class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
			<div class="flex items-start justify-between gap-3">
				<div>
					<h2 class="text-sm font-semibold text-slate-800">Upcoming deadlines</h2>
					<p class="mt-0.5 text-xs text-slate-500">
						Next 5 within {data.dashboard.lookahead.from} → {data.dashboard.lookahead.to}
					</p>
				</div>
				<span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
					{data.dashboard.upcoming.length} / 5
				</span>
			</div>

			{#if data.dashboard.upcoming.length === 0}
				<p class="mt-8 text-center text-sm text-slate-500">
					Nothing due in the next 7 days.
				</p>
			{:else}
				<ul class="mt-4 divide-y divide-slate-100">
					{#each data.dashboard.upcoming as p (p.id)}
						{@const meta = statusMeta(p.status)}
						{@const urg = urgencyOf(p as DeadlineRow)}
						{@const d = daysFromToday(p.deadline)}
						<li>
							<a
								class="flex items-center gap-3 py-3 transition hover:bg-slate-50"
								href={`/projects/${p.id}`}
							>
								<div class="flex w-12 shrink-0 flex-col items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-1 py-1.5 text-center">
									<span class="text-[10px] font-medium uppercase tracking-wide text-slate-400">
										{(p.deadline ?? '').slice(5, 7)}
									</span>
									<span class="text-base font-semibold text-slate-800">
										{(p.deadline ?? '').slice(8, 10)}
									</span>
								</div>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium text-slate-800">{p.name}</p>
									<p class="truncate text-[11px] text-slate-500">
										owner: {p.ownerName ?? p.ownerEmail ?? '— unassigned —'}
									</p>
								</div>
								<div class="flex shrink-0 items-center gap-2">
									<span
										class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
										style={`background:${urg.soft};color:${urg.text}`}
									>
										<span class="h-1.5 w-1.5 rounded-full" style={`background:${urg.fill}`}></span>
										{urg.label}
									</span>
									<span
										class="rounded-full px-2 py-0.5 text-[10px] font-medium"
										style={`background:${meta.soft};color:${meta.text}`}
									>
										{meta.label}
									</span>
									<span class="w-20 text-right text-[11px] text-slate-500">
										{formatRelative(d)}
									</span>
								</div>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</article>
	</section>

	<!-- Overdue -->
	<section class="rounded-xl border border-rose-200 bg-white p-5 shadow-sm">
		<div class="flex items-start justify-between gap-3 border-b border-rose-100 pb-3">
			<div>
				<h2 class="text-sm font-semibold text-rose-700">Overdue</h2>
				<p class="mt-0.5 text-xs text-rose-500">Projects past their deadline that aren't yet completed.</p>
			</div>
			<span class="rounded-full bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700">
				{data.dashboard.overdue.length} item{data.dashboard.overdue.length === 1 ? '' : 's'}
			</span>
		</div>

		{#if data.dashboard.overdue.length === 0}
			<p class="mt-4 text-sm text-slate-600">Nothing overdue — nice work.</p>
		{:else}
			<div class="mt-2 overflow-x-auto rounded-lg">
				<table class="min-w-full divide-y divide-slate-200 text-sm">
					<thead class="bg-slate-50 text-left text-xs text-slate-600">
						<tr>
							<th class="px-3 py-2 font-medium">Project</th>
							<th class="px-3 py-2 font-medium">Owner</th>
							<th class="px-3 py-2 font-medium">Status</th>
							<th class="px-3 py-2 font-medium">Urgency</th>
							<th class="px-3 py-2 font-medium">Deadline</th>
							<th class="px-3 py-2 text-right font-medium">Overdue</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-100">
						{#each data.dashboard.overdue as p (p.id)}
							{@const meta = statusMeta(p.status)}
							{@const urg = urgencyOf(p as DeadlineRow)}
							{@const d = daysFromToday(p.deadline)}
							<tr class="cursor-pointer hover:bg-rose-50/40" onclick={() => (window.location.href = `/projects/${p.id}`)}>
								<td class="px-3 py-2">
									<p class="font-medium text-slate-800">{p.name}</p>
									<p class="text-[11px] text-slate-500">{p.id}</p>
								</td>
								<td class="px-3 py-2 text-slate-600">
									{p.ownerName ?? p.ownerEmail ?? '—'}
								</td>
								<td class="px-3 py-2">
									<span
										class="rounded-full px-2 py-0.5 text-[11px] font-medium"
										style={`background:${meta.soft};color:${meta.text}`}
									>
										{meta.label}
									</span>
								</td>
								<td class="px-3 py-2">
									<span
										class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
										style={`background:${urg.soft};color:${urg.text}`}
									>
										<span class="h-1.5 w-1.5 rounded-full" style={`background:${urg.fill}`}></span>
										{urg.label}
									</span>
								</td>
								<td class="px-3 py-2 font-medium text-rose-700">{p.deadline ?? '—'}</td>
								<td class="px-3 py-2 text-right text-xs text-rose-600">{formatRelative(d)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<p class="text-right text-[11px] text-slate-400">
		Last refreshed {lastRefreshedAt.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
	</p>
</div>
