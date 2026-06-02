<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	const statusColor = (status: string) => {
		switch (status) {
			case 'completed':
				return '#0f9d58';
			case 'ongoing':
				return '#1e88e5';
			case 'under_review':
				return '#f4b400';
			case 'unassigned':
				return '#94a3b8';
			case 'active':
				return '#0f9d58';
			case 'archived':
				return '#64748b';
			default:
				return '#cbd5e1';
		}
	};

	const totalStatusCount = $derived(
		(data.dashboard.statusSummary ?? []).reduce(
			(acc: number, r: { count: number }) => acc + r.count,
			0
		)
	);

	const pieSegments = $derived.by(() => {
		const total = totalStatusCount;
		if (total === 0) return [] as Array<{ status: string; pct: number; color: string }>;
		return (data.dashboard.statusSummary ?? []).map(
			(r: { status: string; count: number }) => ({
				status: r.status,
				pct: (r.count / total) * 100,
				color: statusColor(r.status)
			})
		);
	});

	// TKMGMT10 — Dashboard automatically refreshes. We use a 60s tick so the
	// numbers don't drift far behind reality.
	let refreshTimer: ReturnType<typeof setInterval> | null = null;
	onMount(() => {
		refreshTimer = setInterval(() => {
			invalidateAll();
		}, 60_000);
		return () => {
			if (refreshTimer) clearInterval(refreshTimer);
		};
	});

	const todayIso = new Date().toISOString().slice(0, 10);
	const daysOverdue = (deadline: string | null) => {
		if (!deadline) return 0;
		const a = new Date(deadline);
		const b = new Date(todayIso);
		if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
		const diff = Math.floor((b.getTime() - a.getTime()) / 86_400_000);
		return Math.max(0, diff);
	};
</script>

<div class="space-y-6">
	<header>
		<nav class="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
			<a class="hover:text-[var(--sf-green)] hover:underline" href="/projects">Projects</a>
			<span class="text-slate-300">/</span>
			<span class="text-slate-600">Dashboard</span>
		</nav>
		<h1 class="text-xl font-medium text-slate-900">Project Dashboard</h1>
		<p class="mt-1 text-[13px] text-slate-600">
			Status mix at a glance, the next 5 deadlines, and anything that is past its due date.
			Auto-refreshes every minute · last refreshed
			{new Date(data.dashboard.generatedAt).toLocaleTimeString()}.
		</p>
	</header>

	<div class="grid gap-5 lg:grid-cols-[1.2fr_1.8fr]">
		<!-- Status summary chart -->
		<section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
			<h2 class="text-sm font-medium text-slate-800">Status mix</h2>
			<p class="mt-0.5 text-xs text-slate-500">
				Counts across {totalStatusCount} active project{totalStatusCount === 1 ? '' : 's'}.
			</p>

			{#if totalStatusCount === 0}
				<p class="mt-6 text-sm text-slate-500">No projects yet.</p>
			{:else}
				<div class="mt-4 flex items-start gap-6">
					<!-- Simple conic-gradient pie -->
					<div
						class="h-32 w-32 shrink-0 rounded-full shadow-inner"
						style={`background: conic-gradient(${pieSegments
							.map((s: { color: string; pct: number }, i: number, arr: any[]) => {
								let acc = 0;
								for (let k = 0; k < i; k++) acc += arr[k].pct;
								return `${s.color} ${acc}% ${acc + s.pct}%`;
							})
							.join(', ')})`}
					></div>
					<ul class="flex-1 space-y-2 text-xs">
						{#each pieSegments as s}
							<li class="flex items-center gap-2">
								<span
									class="inline-block h-3 w-3 rounded-sm"
									style={`background:${s.color}`}
								></span>
								<span class="font-medium text-slate-700">{s.status}</span>
								<span class="text-slate-500">{s.pct.toFixed(0)}%</span>
							</li>
						{/each}
					</ul>
				</div>

				<!-- Bar chart fallback for status counts -->
				<div class="mt-6 space-y-2">
					{#each data.dashboard.statusSummary as r}
						<div class="flex items-center gap-2 text-xs">
							<span class="w-28 shrink-0 font-medium text-slate-700">{r.status}</span>
							<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
								<div
									class="h-full"
									style={`background:${statusColor(r.status)};width:${
										totalStatusCount === 0 ? 0 : (r.count / totalStatusCount) * 100
									}%`}
								></div>
							</div>
							<span class="w-10 shrink-0 text-right text-slate-500">{r.count}</span>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Upcoming deadlines -->
		<section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
			<div class="flex items-baseline justify-between">
				<h2 class="text-sm font-medium text-slate-800">Upcoming deadlines</h2>
				<p class="text-xs text-slate-500">
					Next 5 within {data.dashboard.lookahead.from} → {data.dashboard.lookahead.to}
				</p>
			</div>
			{#if data.dashboard.upcoming.length === 0}
				<p class="mt-4 text-sm text-slate-500">No deadlines in the next 7 days.</p>
			{:else}
				<ul class="mt-3 divide-y divide-slate-100">
					{#each data.dashboard.upcoming as p}
						<li class="flex items-center justify-between gap-3 py-2.5 text-sm">
							<a
								class="min-w-0 flex-1 hover:text-[var(--sf-green)]"
								href={`/projects/${p.id}`}
							>
								<p class="truncate font-medium text-slate-800">{p.name}</p>
								<p class="text-[11px] text-slate-500">
									owner: {p.ownerName ?? p.ownerEmail ?? '—'} · P{p.priority}
								</p>
							</a>
							<div class="shrink-0 text-right">
								<p class="text-sm font-medium text-slate-700">{p.deadline}</p>
								<p class="text-[11px] text-slate-500">{p.status}</p>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	<!-- Overdue -->
	<section class="rounded-xl border border-rose-200 bg-rose-50/40 p-5 shadow-sm">
		<div class="flex items-baseline justify-between">
			<h2 class="text-sm font-medium text-rose-700">Overdue</h2>
			<p class="text-xs text-rose-500">
				{data.dashboard.overdue.length} project{data.dashboard.overdue.length === 1 ? '' : 's'} past their deadline
			</p>
		</div>
		{#if data.dashboard.overdue.length === 0}
			<p class="mt-3 text-sm text-rose-600">Nothing overdue — nice work.</p>
		{:else}
			<ul class="mt-3 divide-y divide-rose-100">
				{#each data.dashboard.overdue as p}
					<li class="flex items-center justify-between gap-3 py-2.5 text-sm">
						<a
							class="min-w-0 flex-1 hover:text-rose-700"
							href={`/projects/${p.id}`}
						>
							<p class="truncate font-medium text-rose-800">⚠ {p.name}</p>
							<p class="text-[11px] text-rose-500">
								owner: {p.ownerName ?? p.ownerEmail ?? '—'} · P{p.priority}
							</p>
						</a>
						<div class="shrink-0 text-right">
							<p class="text-sm font-medium text-rose-700">{p.deadline}</p>
							<p class="text-[11px] text-rose-500">
								{daysOverdue(p.deadline)} day{daysOverdue(p.deadline) === 1 ? '' : 's'} overdue
							</p>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
