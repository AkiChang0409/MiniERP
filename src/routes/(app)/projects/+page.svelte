<script lang="ts">
	import { computeUrgency } from '$modules/project';

	let { data } = $props();

	const listHref = (page: number, overrides?: Record<string, string>) => {
		const p = new URLSearchParams();
		p.set('page', String(page));
		if (data.filters.q) p.set('q', data.filters.q);
		if (data.filters.status) p.set('status', data.filters.status);
		if (data.filters.startedAfter) p.set('startedAfter', data.filters.startedAfter);
		if (data.filters.scope && data.filters.scope !== 'all') p.set('scope', data.filters.scope);
		if (overrides) for (const [k, v] of Object.entries(overrides)) p.set(k, v);
		const qs = p.toString();
		return qs ? `/projects?${qs}` : '/projects';
	};

	const statusColor = (status: string) => {
		switch (status) {
			case 'completed':
				return 'bg-emerald-100 text-emerald-700';
			case 'ongoing':
				return 'bg-sky-100 text-sky-700';
			case 'under_review':
				return 'bg-amber-100 text-amber-700';
			case 'unassigned':
				return 'bg-slate-100 text-slate-700';
			case 'archived':
				return 'bg-slate-200 text-slate-600';
			default:
				return 'bg-slate-100 text-slate-700';
		}
	};
</script>

<div class="space-y-5">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div class="min-w-0">
			<nav class="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
				<a class="hover:text-[var(--sf-green)] hover:underline" href="/finance/dashboard">Dashboard</a>
				<span class="text-slate-300">/</span>
				<span class="text-slate-600">Projects</span>
			</nav>
			<h1 class="text-xl font-medium text-slate-900">Projects</h1>
			<p class="mt-1 text-[13px] text-slate-600">
				Track what you own and collaborate on. Open a project for the full timeline, comments, and
				profit breakdown.
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

	<!-- Scope tabs (TKMGMT3) -->
	<nav class="flex items-center gap-1 border-b border-slate-200 text-sm">
		<a
			class="border-b-2 px-3 py-2 {data.filters.scope === 'all'
				? 'border-[var(--sf-green)] text-[var(--sf-green)] font-medium'
				: 'border-transparent text-slate-500 hover:text-slate-700'}"
			href={listHref(1, { scope: 'all' })}
			data-sveltekit-noscroll
		>
			All
		</a>
		<a
			class="border-b-2 px-3 py-2 {data.filters.scope === 'mine'
				? 'border-[var(--sf-green)] text-[var(--sf-green)] font-medium'
				: 'border-transparent text-slate-500 hover:text-slate-700'}"
			href={listHref(1, { scope: 'mine' })}
			data-sveltekit-noscroll
		>
			Mine (owned + collaborating)
		</a>
	</nav>

	<section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
		<form
			class="grid gap-3 lg:grid-cols-[2fr_1fr_1.3fr_auto_auto]"
			method="GET"
			data-sveltekit-noscroll
		>
			<input type="hidden" name="page" value="1" />
			<input type="hidden" name="scope" value={data.filters.scope} />
			<label class="space-y-1">
				<span class="text-xs font-medium text-slate-600">Project search</span>
				<input
					class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
					name="q"
					value={data.filters.q}
					placeholder="Project name / Project ID / Customer name"
				/>
			</label>
			<label class="space-y-1">
				<span class="text-xs font-medium text-slate-600">Status</span>
				<select class="w-full rounded border border-slate-300 px-3 py-2 text-sm" name="status">
					<option value="">All status</option>
					<option value="unassigned" selected={data.filters.status === 'unassigned'}>unassigned</option>
					<option value="ongoing" selected={data.filters.status === 'ongoing'}>ongoing</option>
					<option value="under_review" selected={data.filters.status === 'under_review'}>under_review</option>
					<option value="completed" selected={data.filters.status === 'completed'}>completed</option>
					<option value="active" selected={data.filters.status === 'active'}>active (legacy)</option>
					<option value="archived" selected={data.filters.status === 'archived'}>archived</option>
				</select>
			</label>
			<label class="space-y-1">
				<span class="text-xs font-medium text-slate-600">Started on or after</span>
				<input
					class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
					name="startedAfter"
					type="date"
					value={data.filters.startedAfter}
				/>
			</label>
			<button
				class="h-10 rounded border border-[var(--sf-green)] bg-[var(--sf-green)] px-4 text-sm font-medium text-white hover:bg-[#2f5e2c] lg:mt-6"
				type="submit"
			>
				Apply
			</button>
			<a
				class="inline-flex h-10 items-center justify-center rounded border border-[var(--sf-gold)] bg-[var(--sf-gold-soft)] px-4 text-center text-sm font-medium text-[#7a5a07] hover:bg-[#f6e8b8] lg:mt-6"
				href={listHref(1, { q: '', status: '', startedAfter: '' })}
				data-sveltekit-noscroll
			>
				Reset
			</a>
		</form>
	</section>

	<section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
		<p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Matched projects</p>
		{#if data.projects.length === 0}
			<p class="mt-3 text-sm text-slate-500">No projects found. Try another keyword or filter.</p>
		{:else}
			<div class="mt-3 overflow-x-auto rounded-lg border border-slate-200">
				<table class="min-w-full divide-y divide-slate-200 text-xs">
					<thead class="bg-slate-50 text-left text-slate-600">
						<tr>
							<th class="px-3 py-2">Project</th>
							<th class="px-3 py-2">Owner</th>
							<th class="px-3 py-2">Status</th>
							<th class="px-3 py-2">Urgency</th>
							<th class="px-3 py-2">Deadline</th>
							<th class="px-3 py-2">Customer</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-100">
						{#each data.projects as project}
							{@const urg = computeUrgency({
								status: project.status,
								startDate: project.startDate,
								deadline: project.deadline
							})}
							<tr class="hover:bg-slate-50/80">
								<td class="px-0 py-0">
									<a
										class="group block cursor-pointer px-3 py-2 no-underline transition hover:bg-[var(--sf-green-soft)]/60"
										href={`/projects/${project.id}`}
										data-sveltekit-noscroll
									>
										<p class="font-medium text-slate-800 group-hover:text-[var(--sf-green)]">{project.name}</p>
										<p class="text-slate-500">{project.id}</p>
										<p class="mt-0.5 text-[11px] text-slate-400">
											Updated {project.updatedAt.slice(0, 10)}
										</p>
									</a>
								</td>
								<td class="px-3 py-2">
									{#if project.ownerEmail}
										<p class="font-medium text-slate-700">{project.ownerName ?? project.ownerEmail}</p>
										<p class="text-[11px] text-slate-400">{project.ownerEmail}</p>
									{:else}
										<span class="text-slate-400">— unassigned —</span>
									{/if}
								</td>
								<td class="px-3 py-2">
									<span class="rounded-full px-2 py-0.5 text-[11px] {statusColor(project.status)}">
										{project.status}
									</span>
								</td>
								<td class="px-3 py-2">
									<span
										class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
										style={`background:${urg.soft};color:${urg.text}`}
										title={urg.percentElapsed != null ? `${urg.percentElapsed}% of time elapsed` : urg.label}
									>
										<span class="h-1.5 w-1.5 rounded-full" style={`background:${urg.fill}`}></span>
										{urg.label}
									</span>
								</td>
								<td class="px-3 py-2">
									{#if project.deadline}
										<span class={urg.level === 'overdue' ? 'font-medium text-rose-600' : 'text-slate-700'}>
											{project.deadline}
										</span>
										{#if urg.daysUntilDeadline != null}
											<span class="block text-[11px] text-slate-400">
												{urg.daysUntilDeadline >= 0
													? `${urg.daysUntilDeadline}d left`
													: `${Math.abs(urg.daysUntilDeadline)}d overdue`}
											</span>
										{/if}
									{:else}
										<span class="text-slate-400">—</span>
									{/if}
								</td>
								<td class="px-3 py-2">{project.customerName ?? '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
				<p>
					Page {data.pagination.page} / {data.pagination.totalPages} · Total projects:
					{data.pagination.total}
				</p>
				<div class="flex items-center gap-2">
					{#if data.pagination.hasPrev}
						<a
							class="rounded border border-slate-300 bg-white px-2 py-1 hover:bg-slate-100"
							href={listHref(data.pagination.page - 1)}
							data-sveltekit-noscroll
						>
							Previous
						</a>
					{/if}
					{#if data.pagination.hasNext}
						<a
							class="rounded border border-slate-300 bg-white px-2 py-1 hover:bg-slate-100"
							href={listHref(data.pagination.page + 1)}
							data-sveltekit-noscroll
						>
							Next
						</a>
					{/if}
				</div>
			</div>
		{/if}
	</section>
</div>
