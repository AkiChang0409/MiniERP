<script lang="ts">
	import { computeUrgency } from '$modules/project';

	let { data } = $props();

	type CalEntry = {
		id: string;
		name: string;
		status: string;
		deadline: string | null;
		priority: number;
		recurrenceFrequency: string | null;
		recurrenceInterval: number | null;
		recurrenceParentId: string | null;
	};

	const STATUS_PALETTE: Record<string, { fill: string; soft: string; text: string; label: string }> = {
		unassigned: { fill: '#94a3b8', soft: '#f1f5f9', text: '#475569', label: 'Unassigned' },
		ongoing: { fill: '#1e88e5', soft: '#e0f2fe', text: '#0c4a6e', label: 'Ongoing' },
		under_review: { fill: '#f59e0b', soft: '#fef3c7', text: '#92400e', label: 'Under Review' },
		completed: { fill: '#16a34a', soft: '#dcfce7', text: '#166534', label: 'Completed' },
		active: { fill: '#0f9d58', soft: '#dcfce7', text: '#166534', label: 'Active' },
		on_hold: { fill: '#fb923c', soft: '#ffedd5', text: '#9a3412', label: 'On Hold' },
		archived: { fill: '#64748b', soft: '#e2e8f0', text: '#334155', label: 'Archived' }
	};
	const statusMeta = (status: string) =>
		STATUS_PALETTE[status] ?? { fill: '#cbd5e1', soft: '#f1f5f9', text: '#475569', label: status };

	const monthLabel = $derived.by(() => {
		const d = new Date(Date.UTC(data.month.year, data.month.month, 1));
		return d.toLocaleString('en-SG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
	});

	const monthHref = (year: number, month: number) =>
		`/projects/calendar?month=${year}-${String(month + 1).padStart(2, '0')}`;

	const prevMonthHref = $derived.by(() => {
		const d = new Date(Date.UTC(data.month.year, data.month.month - 1, 1));
		return monthHref(d.getUTCFullYear(), d.getUTCMonth());
	});
	const nextMonthHref = $derived.by(() => {
		const d = new Date(Date.UTC(data.month.year, data.month.month + 1, 1));
		return monthHref(d.getUTCFullYear(), d.getUTCMonth());
	});

	const icsHref = $derived(
		`/api/projects/calendar?format=ics&from=${data.range.from}&to=${data.range.to}`
	);

	const dayMap = $derived.by(() => {
		const map = new Map<string, CalEntry[]>();
		for (const entry of (data.entries ?? []) as CalEntry[]) {
			if (!entry.deadline) continue;
			const list = map.get(entry.deadline) ?? [];
			list.push(entry);
			map.set(entry.deadline, list);
		}
		return map;
	});

	const todayIso = new Date().toISOString().slice(0, 10);

	// Stats for the eyebrow strip.
	const totalThisMonth = $derived((data.entries ?? []).length);
	const completedThisMonth = $derived(
		((data.entries ?? []) as CalEntry[]).filter((e) => e.status === 'completed').length
	);
	const recurringThisMonth = $derived(
		((data.entries ?? []) as CalEntry[]).filter((e) => e.recurrenceFrequency).length
	);
	const overdueThisMonth = $derived(
		((data.entries ?? []) as CalEntry[]).filter(
			(e) => e.deadline && e.deadline < todayIso && e.status !== 'completed'
		).length
	);

	// Build the month grid: 6 weeks × 7 cells, with leading/trailing blanks
	// padded so the visual grid is always consistent.
	const cells = $derived.by(() => {
		const first = new Date(Date.UTC(data.month.year, data.month.month, 1));
		const firstWeekday = first.getUTCDay(); // 0=Sun
		const daysInMonth = new Date(
			Date.UTC(data.month.year, data.month.month + 1, 0)
		).getUTCDate();

		const out: Array<{
			iso: string | null;
			day: number | null;
			inMonth: boolean;
			isWeekend: boolean;
		}> = [];
		for (let i = 0; i < firstWeekday; i++) {
			out.push({ iso: null, day: null, inMonth: false, isWeekend: i === 0 || i === 6 });
		}
		for (let d = 1; d <= daysInMonth; d++) {
			const iso = `${data.month.year}-${String(data.month.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
			out.push({ iso, day: d, inMonth: true, isWeekend: weekday === 0 || weekday === 6 });
		}
		while (out.length < 42) {
			const weekday = out.length % 7;
			out.push({ iso: null, day: null, inMonth: false, isWeekend: weekday === 0 || weekday === 6 });
		}
		return out;
	});

	// Calendar chip colour now follows the same auto-urgency logic as the
	// list / dashboard / Gantt — derived from the deadline, no manual priority.
	const urgencyForEntry = (entry: CalEntry) =>
		computeUrgency({
			status: entry.status,
			deadline: entry.deadline
		});
</script>

<div class="space-y-5">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div class="min-w-0">
			<nav class="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
				<a class="hover:text-[var(--sf-green)] hover:underline" href="/projects">Projects</a>
				<span class="text-slate-300">/</span>
				<span class="text-slate-600">Calendar</span>
			</nav>
			<h1 class="text-xl font-medium text-slate-900">Project Calendar</h1>
			<p class="mt-1 text-[13px] text-slate-600">
				Recurring projects appear on every occurrence's deadline. Subscribe via ICS to mirror this
				view in Google Calendar or Outlook.
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
				href={icsHref}
				class="inline-flex items-center justify-center rounded-md border border-[var(--sf-gold)] bg-[var(--sf-gold-soft)] px-3.5 py-2 text-[13px] font-medium text-[#7a5a07] hover:bg-[#f6e8b8]"
			>
				Download .ics
			</a>
			<a
				href="/projects/new"
				class="inline-flex items-center justify-center rounded-md bg-[var(--sf-green)] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#2f5e2c]"
			>
				Create project
			</a>
		</div>
	</header>

	<!-- KPI strip -->
	<section class="grid grid-cols-2 gap-4 md:grid-cols-4">
		<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Deadlines this month</p>
			<p class="mt-1 text-2xl font-semibold text-slate-900">{totalThisMonth}</p>
			<p class="mt-1 text-[11px] text-slate-500">{monthLabel}</p>
		</article>
		<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Completed</p>
			<p class="mt-1 text-2xl font-semibold text-slate-900">{completedThisMonth}</p>
			<p class="mt-1 text-[11px] text-slate-500">marked done</p>
		</article>
		<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Recurring</p>
			<p class="mt-1 text-2xl font-semibold text-slate-900">{recurringThisMonth}</p>
			<p class="mt-1 text-[11px] text-slate-500">on a series</p>
		</article>
		<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Overdue</p>
			<p
				class="mt-1 text-2xl font-semibold {overdueThisMonth > 0 ? 'text-rose-600' : 'text-slate-900'}"
			>
				{overdueThisMonth}
			</p>
			<p class="mt-1 text-[11px] text-slate-500">past their deadline</p>
		</article>
	</section>

	<!-- Month navigator + legend -->
	<section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex items-center gap-2">
				<a
					class="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
					href={prevMonthHref}
					aria-label="Previous month"
				>
					←
				</a>
				<h2 class="px-1 text-base font-semibold text-slate-900">{monthLabel}</h2>
				<a
					class="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
					href={nextMonthHref}
					aria-label="Next month"
				>
					→
				</a>
				<a
					class="ml-1 inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
					href="/projects/calendar"
				>
					Today
				</a>
			</div>
			<div class="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
				<span class="inline-flex items-center gap-1">
					<span class="inline-block h-2 w-2 rounded-sm" style="background:#bbf7d0"></span>
					On track
				</span>
				<span class="inline-flex items-center gap-1">
					<span class="inline-block h-2 w-2 rounded-sm" style="background:#fde68a"></span>
					Watch
				</span>
				<span class="inline-flex items-center gap-1">
					<span class="inline-block h-2 w-2 rounded-sm" style="background:#fecaca"></span>
					Urgent / overdue
				</span>
				<span class="inline-flex items-center gap-1">
					<span class="opacity-60">⟳</span>
					Recurring
				</span>
			</div>
		</div>
	</section>

	<!-- Calendar grid -->
	<section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
		<div
			class="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500"
		>
			<div class="py-2.5">Sun</div>
			<div class="py-2.5">Mon</div>
			<div class="py-2.5">Tue</div>
			<div class="py-2.5">Wed</div>
			<div class="py-2.5">Thu</div>
			<div class="py-2.5">Fri</div>
			<div class="py-2.5">Sat</div>
		</div>
		<div class="grid grid-cols-7">
			{#each cells as cell, i}
				<div
					class="relative min-h-[124px] border-b border-r border-slate-100 p-2 text-[11px] {cell.inMonth
						? cell.isWeekend
							? 'bg-slate-50/40'
							: ''
						: 'bg-slate-50/70 text-slate-300'}"
					class:bg-[var(--sf-green-soft)]={cell.iso === todayIso}
				>
					{#if cell.day !== null}
						<div class="mb-1.5 flex items-center justify-between">
							<span
								class="text-xs font-semibold {cell.iso === todayIso
									? 'text-[var(--sf-green)]'
									: 'text-slate-700'}"
							>
								{cell.day}
							</span>
							{#if cell.iso === todayIso}
								<span class="rounded-full bg-[var(--sf-green)] px-1.5 py-0.5 text-[9px] font-medium text-white">
									Today
								</span>
							{/if}
						</div>
						{#if cell.iso}
							{@const entries = dayMap.get(cell.iso) ?? []}
							{#if entries.length > 0}
								<ul class="space-y-1">
									{#each entries.slice(0, 3) as entry (entry.id)}
										{@const urg = urgencyForEntry(entry)}
										{@const meta = statusMeta(entry.status)}
										<li>
											<a
												href={`/projects/${entry.id}`}
												class="block truncate rounded border px-1.5 py-1 text-[10.5px] leading-tight"
												style={`background:${urg.soft};color:${urg.text};border-color:${urg.border}`}
												title={`${entry.name} · ${meta.label} · ${urg.label}`}
											>
												<span class="font-medium">
													{#if entry.recurrenceFrequency}<span class="opacity-70">⟳ </span>{/if}{entry.name}
												</span>
											</a>
										</li>
									{/each}
									{#if entries.length > 3}
										<li class="px-1.5 text-[10px] text-slate-500">+ {entries.length - 3} more</li>
									{/if}
								</ul>
							{/if}
						{/if}
					{/if}
				</div>
			{/each}
		</div>
	</section>

	{#if data.dataMessage}
		<div class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
			⚠ {data.dataMessage}
		</div>
	{/if}

	<!-- Two-way sync (Epic 5) -->
	<section class="rounded-xl border border-slate-200 bg-white p-4 text-xs">
		<p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
			Two-way calendar sync
		</p>
		<p class="mt-1 text-slate-600">
			Connect your calendar to push these deadlines (and reschedules) directly to Google
			Calendar or Outlook.
		</p>
		<div class="mt-3 grid gap-2 sm:grid-cols-2">
			{#each (data.integrations ?? []) as int}
				<div class="rounded-md border border-slate-200 bg-slate-50/50 p-3">
					<p class="text-sm font-medium capitalize text-slate-800">{int.provider}</p>
					{#if !int.configured}
						<p class="mt-1 text-[11px] text-amber-700">
							Operator needs to set
							<code class="font-mono text-[10px]">
								{int.provider === 'google'
									? 'GOOGLE_CALENDAR_CLIENT_ID + SECRET'
									: 'OUTLOOK_CLIENT_ID + SECRET'}
							</code>
							to enable.
						</p>
					{:else if int.connected}
						<p class="mt-1 text-[11px] text-slate-600">
							Connected as <span class="font-mono">{int.externalAccountEmail}</span>
						</p>
						<form
							method="POST"
							action={`/api/projects/calendar/oauth/${int.provider}/disconnect`}
							class="mt-2"
						>
							<button
								type="submit"
								class="rounded-md border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50"
							>
								Disconnect
							</button>
						</form>
					{:else}
						<a
							class="mt-2 inline-flex rounded-md border border-[var(--sf-green)] bg-[var(--sf-green-soft)] px-2 py-1 text-[11px] font-medium text-[var(--sf-green)] hover:bg-emerald-100"
							href={`/api/projects/calendar/oauth/${int.provider}/start`}
						>
							Connect {int.provider}
						</a>
					{/if}
				</div>
			{/each}
		</div>

		<details class="mt-3 text-[11px] text-slate-500">
			<summary class="cursor-pointer">Or subscribe via ICS</summary>
			<p class="mt-1">
				Paste this URL into any calendar app to subscribe to a read-only feed:
				<code class="block rounded bg-slate-50 px-1.5 py-0.5 font-mono">{icsHref}</code>
			</p>
		</details>
	</section>
</div>
