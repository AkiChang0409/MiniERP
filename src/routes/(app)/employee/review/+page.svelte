<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	type ReviewRecord = {
		id: string;
		code: string | null;
		name: string;
		status: string;
		fields: string | null;
		requiresApproval: boolean;
		isRequired: boolean;
		rejectedReason: string | null;
		responsibleName: string | null;
	};
	type QueueTask = {
		id: string;
		projectId: string;
		projectName: string | null;
		name: string;
		description: string | null;
		endDate: string | null;
		submissionNote: string | null;
		assigneeName: string | null;
		assigneeEmail: string | null;
		records: ReviewRecord[];
	};

	const queue = $derived((data.queue as QueueTask[]) ?? []);
	let busyId = $state<string | null>(null);
	let errorById = $state<{ [id: string]: string }>({});

	const recColor = (s: string) => {
		switch (s) {
			case 'approved':
				return 'bg-emerald-100 text-emerald-700';
			case 'submitted':
				return 'bg-amber-100 text-amber-700';
			case 'rejected':
				return 'bg-rose-100 text-rose-700';
			case 'waived':
				return 'bg-slate-200 text-slate-600';
			default:
				return 'bg-slate-100 text-slate-500';
		}
	};

	async function decide(t: QueueTask, decision: 'approve' | 'reject') {
		let reason: string | null = null;
		if (decision === 'reject') {
			reason = prompt('退回原因（assignee 会看到）：') ?? '';
		}
		busyId = t.id;
		errorById = { ...errorById, [t.id]: '' };
		try {
			const res = await fetch(`/api/projects/${t.projectId}/tasks/${t.id}/review`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ decision, reason })
			});
			if (!res.ok) {
				let msg = `操作失败 (HTTP ${res.status}).`;
				try {
					const b: any = await res.json();
					if (b?.error) msg = b.error;
				} catch {
					/* non-JSON */
				}
				errorById = { ...errorById, [t.id]: msg };
				return;
			}
			await invalidateAll();
		} catch (e) {
			errorById = { ...errorById, [t.id]: `网络错误：${(e as Error).message}` };
		} finally {
			busyId = null;
		}
	}
</script>

<PageShell
	eyebrow="Employee · Review"
	title="审核工作区"
	description="你负责项目里、assignee 提交待审的任务。通过则任务完成；退回则回到“进行中”由 assignee 重新提交。"
>
	{#if data.dataMessage}
		<p class="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
			{data.dataMessage}
		</p>
	{/if}

	<p class="mb-4 text-sm text-slate-500">
		待审 <span class="font-semibold text-[var(--sf-green)]">{queue.length}</span> 项。
	</p>

	<div class="space-y-4">
		{#each queue as t (t.id)}
			<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<div class="flex flex-wrap items-center gap-2">
					<span class="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">待审核</span>
					<a href={`/projects/${t.projectId}/tasks`} class="text-sm font-semibold text-slate-900 hover:text-[var(--sf-green)] hover:underline">{t.name}</a>
					<span class="text-xs text-slate-400">·</span>
					<span class="text-xs text-slate-500">{t.projectName ?? '项目'}</span>
					<span class="ml-auto text-xs text-slate-500">提交人：{t.assigneeName ?? t.assigneeEmail ?? '—'}</span>
				</div>

				{#if t.description}
					<p class="mt-1.5 text-sm text-slate-600">{t.description}</p>
				{/if}
				{#if t.submissionNote}
					<p class="mt-1.5 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">提交说明：{t.submissionNote}</p>
				{/if}

				{#if t.records.length > 0}
					<ul class="mt-2 space-y-1.5">
						{#each t.records as r (r.id)}
							<li class="rounded-md border border-slate-200 bg-slate-50/60 p-2">
								<div class="flex flex-wrap items-center gap-2">
									<span class="rounded-full px-2 py-0.5 text-[10px] {recColor(r.status)}">{r.status}</span>
									<span class="text-xs font-medium text-slate-700">{r.code ? r.code + ' · ' : ''}{r.name}</span>
									{#if r.requiresApproval}<span class="text-[10px] text-amber-600">需审批</span>{/if}
									<span class="text-[10px] text-slate-400">责任人：{r.responsibleName ?? '—'}</span>
								</div>
								{#if r.fields}
									<p class="mt-1 whitespace-pre-wrap text-[11px] text-slate-600">填写：{r.fields}</p>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}

				{#if errorById[t.id]}
					<p class="mt-2 text-xs text-rose-600">{errorById[t.id]}</p>
				{/if}
				<div class="mt-3 flex justify-end gap-2">
					<button
						type="button"
						class="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60"
						disabled={busyId === t.id}
						onclick={() => decide(t, 'reject')}
					>
						退回
					</button>
					<button
						type="button"
						class="rounded-md bg-[var(--sf-green)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2f5e2c] disabled:opacity-60"
						disabled={busyId === t.id}
						onclick={() => decide(t, 'approve')}
					>
						{busyId === t.id ? '处理中…' : '通过 → 完成'}
					</button>
				</div>
			</div>
		{:else}
			<div class="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
				没有待审核的提交。
			</div>
		{/each}
	</div>
</PageShell>
