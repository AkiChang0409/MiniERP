<script lang="ts">
	let { data } = $props();

	const monthName = $derived.by(() => {
		const d = new Date(Date.UTC(data.month.year, data.month.month, 1));
		return d.toLocaleString('en-SG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
	});

	const prevMonthHref = $derived.by(() => {
		const d = new Date(Date.UTC(data.month.year, data.month.month - 1, 1));
		return `/projects/calendar?month=${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
	});

	const nextMonthHref = $derived.by(() => {
		const d = new Date(Date.UTC(data.month.year, data.month.month + 1, 1));
		return `/projects/calendar?month=${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
	});

	const icsHref = $derived(`/api/projects/calendar?format=ics&from=${data.range.from}&to=${data.range.to}`);

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

	// Build the month grid: 6 weeks × 7 cells, with leading/trailing blanks for
	// days outside the current month so the grid always renders cleanly.
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
		}> = [];
		for (let i = 0; i < firstWeekday; i++) {
			out.push({ iso: null, day: null, inMonth: false });
		}
		for (let d = 1; d <= daysInMonth; d++) {
			const iso = `${data.month.year}-${String(data.month.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			out.push({ iso, day: d, inMonth: true });
		}
		while (out.length % 7 !== 0) {
			out.push({ iso: null, day: null, inMonth: false });
		}
		// Pad to 6 rows for visual consistency.
		while (out.length < 42) {
			out.push({ iso: null, day: null, inMonth: false });
		}
		return out;
	});

	const priorityColor = (priority: number) => {
		if (priority >= 8) return 'bg-rose-100 text-rose-700 border-rose-200';
		if (priority >= 5) return 'bg-amber-100 text-amber-700 border-amber-200';
		return 'bg-emerald-100 text-emerald-700 border-emerald-200';
	};
</script>

<div class="space-y-5">
	<header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<nav class="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
				<a class="hover:text-[var(--sf-green)] hover:underline" href="/projects">Projects</a>
				<span class="text-slate-300">/</span>
				<span class="text-slate-600">Calendar</span>
			</nav>
			<h1 class="text-xl font-medium text-slate-900">{monthName}</h1>
			<p class="mt-1 text-[13px] text-slate-600">
				Recurring projects appear on every occurrence's deadline. Subscribe via ICS to mirror this
				view in Google Calendar or Outlook.
			</p>
		</div>
		<div class="flex items-center gap-2">
			<a
				class="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
				href={prevMonthHref}
			>
				← Prev
			</a>
			<a
				class="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
				href={`/projects/calendar`}
			>
				Today
			</a>
			<a
				class="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
				href={nextMonthHref}
			>
				Next →
			</a>
			<a
				class="rounded-md border border-[var(--sf-green)] bg-[var(--sf-green-soft)] px-3 py-1.5 text-xs font-medium text-[var(--sf-green)] hover:bg-emerald-100"
				href={icsHref}
			>
				Download .ics
			</a>
		</div>
	</header>

	<section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
		<div class="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
			<div class="py-2">Sun</div>
			<div class="py-2">Mon</div>
			<div class="py-2">Tue</div>
			<div class="py-2">Wed</div>
			<div class="py-2">Thu</div>
			<div class="py-2">Fri</div>
			<div class="py-2">Sat</div>
		</div>
		<div class="grid grid-cols-7">
			{#each cells as cell, i}
				<div
					class="min-h-[110px] border-b border-r border-slate-100 p-2 text-[11px] last:border-b-0 {cell.inMonth
						? ''
						: 'bg-slate-50/60 text-slate-300'}"
					class:bg-emerald-50={cell.iso === todayIso}
				>
					{#if cell.day !== null}
						<div class="mb-1 flex items-center justify-between">
							<span class="font-medium text-slate-700">{cell.day}</span>
							{#if cell.iso === todayIso}
								<span class="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] text-white">today</span>
							{/if}
						</div>
						{#if cell.iso}
							{@const entries = dayMap.get(cell.iso) ?? []}
							<ul class="space-y-1">
								{#each entries as entry}
									<li>
										<a
											href={`/projects/${entry.id}`}
											class="block truncate rounded border px-1.5 py-0.5 {priorityColor(entry.priority ?? 5)}"
											title={`${entry.name} (${entry.status})`}
										>
											{#if entry.recurrenceFrequency}
												<span class="opacity-70">⟳</span>
											{/if}
											{entry.name}
										</a>
									</li>
								{/each}
							</ul>
						{/if}
					{/if}
				</div>
			{/each}
		</div>
	</section>

	<p class="text-xs text-slate-500">
		Two-way Google/Outlook sync requires per-user OAuth that lives in a separate platform
		integration. The ICS feed above is a read-only subscription that any external calendar can
		consume.
	</p>
</div>
