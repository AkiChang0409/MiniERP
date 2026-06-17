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
				not_started: '待填写',
				draft: '草稿',
				submitted: '已提交 · 待审批',
				approved: '已通过',
				rejected: '被退回',
				waived: '已豁免',
				unassigned: '未开始',
				ongoing: '进行中',
				under_review: '待审批',
				completed: '已完成',
				blocked: '受阻'
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
	title="我的工作台"
	description="分配给你的任务。点开任意任务进入详情页：查看描述、下载模板、填写说明并提交或标记完成。"
>
	{#if data.dataMessage}
		<p class="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
			{data.dataMessage}
		</p>
	{/if}

	<p class="mb-4 text-sm text-slate-500">
		共 <span class="font-semibold text-slate-700">{tasks.length}</span> 个任务，
		<span class="font-semibold text-[var(--sf-green)]">{pendingCount}</span> 项待提交记录。
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
					<span class="text-xs text-slate-500">{t.projectName ?? '项目'}</span>
					{#if !t.assignedToMe}
						<span class="text-[11px] text-slate-400">（你是某记录的责任人）</span>
					{/if}
					{#if t.endDate}
						<span class="ml-auto text-xs text-slate-500">截止 {t.endDate}</span>
					{/if}
				</div>

				{#if t.description}
					<p class="mt-1.5 line-clamp-2 text-sm text-slate-600">{t.description}</p>
				{/if}

				<div class="mt-2 flex items-center justify-between">
					<div class="text-xs text-slate-500">
						{#if sum}
							ISO 记录：
							{#if sum.pending > 0}<span class="font-medium text-rose-600">{sum.pending} 待提交</span>{/if}
							{#if sum.submitted > 0}<span class="ml-1 text-amber-600">{sum.submitted} 待审批</span>{/if}
							{#if sum.done > 0}<span class="ml-1 text-emerald-600">{sum.done} 已通过</span>{/if}
						{:else}
							<span class="text-slate-400">无需 ISO 记录，提交后由 PM 审核完成</span>
						{/if}
					</div>
					<span class="text-xs font-medium text-[var(--sf-green)]">打开任务 →</span>
				</div>
			</a>
		{:else}
			<div class="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
				目前没有分配给你的任务。
			</div>
		{/each}
	</div>
</PageShell>
