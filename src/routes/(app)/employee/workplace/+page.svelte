<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';

	let { data } = $props();

	type WorkRecord = {
		id: string;
		status: string;
		isRequired: boolean;
	};
	type WorkTask = {
		id: string;
		projectId: string;
		projectName: string | null;
		name: string;
		description: string | null;
		status: string;
		startDate: string | null;
		endDate: string | null;
		taskType: string | null;
		assignedToMe: boolean;
		records: WorkRecord[];
	};

	const tasks = $derived((data.workplace as WorkTask[]) ?? []);
	const pendingCount = $derived(
		tasks.reduce(
			(n, t) =>
				n + t.records.filter((r) => ['not_started', 'draft', 'rejected'].includes(r.status)).length,
			0
		)
	);

	const statusColor = (s: string) => {
		switch (s) {
			case 'approved':
			case 'completed':
				return 'bg-emerald-100 text-emerald-700';
			case 'submitted':
			case 'under_review':
				return 'bg-amber-100 text-amber-700';
			case 'rejected':
			case 'blocked':
				return 'bg-rose-100 text-rose-700';
			case 'waived':
				return 'bg-slate-200 text-slate-600';
			case 'ongoing':
			case 'draft':
				return 'bg-sky-100 text-sky-700';
			default:
				return 'bg-slate-100 text-slate-500';
		}
	};
	const statusLabel = (s: string) =>
		(
			({
				not_started: 'Not started',
				draft: 'Draft',
				submitted: 'Submitted · pending approval',
				approved: 'Approved',
				rejected: 'Rejected',
				waived: 'Waived',
				unassigned: 'Not started',
				ongoing: 'In progress',
				under_review: 'Pending approval',
				completed: 'Completed',
				blocked: 'Blocked'
			}) as { [k: string]: string }
		)[s] ?? s;

	// Short per-task summary of the ISO records (drives the overview line).
	function recordSummary(t: WorkTask) {
		if (t.records.length === 0) return null;
		const pending = t.records.filter((r) => ['not_started', 'draft', 'rejected'].includes(r.status)).length;
		const submitted = t.records.filter((r) => r.status === 'submitted').length;
		const done = t.records.filter((r) => ['approved', 'waived'].includes(r.status)).length;
		return { total: t.records.length, pending, submitted, done };
	}
</script>

<PageShell
	eyebrow="Employee · Workplace"
	title="My Workplace"
	description="Tasks assigned to you. Open any task to view details, download templates, add notes, and submit or mark the work complete."
>
	{#if data.dataMessage}
		<p class="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
			{data.dataMessage}
		</p>
	{/if}

	<p class="mb-4 text-sm text-slate-500">
		<span class="font-semibold text-slate-700">{tasks.length}</span> task{tasks.length === 1 ? '' : 's'},
		<span class="font-semibold text-[var(--sf-green)]">{pendingCount}</span> record{pendingCount === 1 ? '' : 's'} pending submission.
	</p>

	<div class="space-y-3">
		{#each tasks as t (t.id)}
			{@const sum = recordSummary(t)}
			<a
				href={`/employee/workplace/${t.id}`}
				class="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[var(--sf-green)] hover:shadow"
			>
				<div class="flex flex-wrap items-center gap-2">
					<span class="rounded-full px-2 py-0.5 text-[11px] {statusColor(t.status)}">{statusLabel(t.status)}</span>
					<span class="text-sm font-semibold text-slate-900">{t.name}</span>
					<span class="text-xs text-slate-400">·</span>
					<span class="text-xs text-slate-500">{t.projectName ?? 'Project'}</span>
					{#if !t.assignedToMe}
						<span class="text-[11px] text-slate-400">(you own one of the records)</span>
					{/if}
					{#if t.endDate}
						<span class="ml-auto text-xs text-slate-500">Due {t.endDate}</span>
					{/if}
				</div>

				{#if t.description}
					<p class="mt-1.5 line-clamp-2 text-sm text-slate-600">{t.description}</p>
				{/if}

				<div class="mt-2 flex items-center justify-between">
					<div class="text-xs text-slate-500">
						{#if sum}
							ISO records:
							{#if sum.pending > 0}<span class="font-medium text-rose-600">{sum.pending} pending submission</span>{/if}
							{#if sum.submitted > 0}<span class="ml-1 text-amber-600">{sum.submitted} pending approval</span>{/if}
							{#if sum.done > 0}<span class="ml-1 text-emerald-600">{sum.done} approved</span>{/if}
						{:else}
							<span class="text-slate-400">No ISO records required. The PM will review this task after submission.</span>
						{/if}
					</div>
					<span class="text-xs font-medium text-[var(--sf-green)]">Open task →</span>
				</div>
			</a>
		{:else}
			<div class="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
				No tasks are assigned to you yet.
			</div>
		{/each}
	</div>
</PageShell>
