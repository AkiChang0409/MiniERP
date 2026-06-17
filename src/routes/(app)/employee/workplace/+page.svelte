<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	type WorkRecord = {
		id: string;
		projectId: string;
		code: string | null;
		name: string;
		status: string;
		fields: string | null;
		requiresApproval: boolean;
		isRequired: boolean;
		version: number;
		rejectedReason: string | null;
		fileUrl: string | null;
		fileName: string | null;
		templateFileUrl: string | null;
		templateFileName: string | null;
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

	// Local edit buffer for the per-record submission notes. Deep-mutated, so
	// Svelte 5 tracks it; falls back to the saved `fields` for display.
	let notes = $state<Record<string, string>>({});
	let busyId = $state<string | null>(null);
	let errorById = $state<Record<string, string>>({});

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
	const canSubmit = (s: string) => ['not_started', 'draft', 'rejected'].includes(s);
	const statusLabel = (s: string) =>
		(
			({
				not_started: '待填写',
				draft: '草稿',
				submitted: '已提交 · 待审批',
				approved: '已通过',
				rejected: '被退回',
				waived: '已豁免'
			}) as Record<string, string>
		)[s] ?? s;

	async function submit(projectId: string, recordId: string) {
		busyId = recordId;
		errorById = { ...errorById, [recordId]: '' };
		try {
			const res = await fetch(`/api/projects/${projectId}/records/${recordId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'submit', fields: notes[recordId] ?? null })
			});
			if (!res.ok) {
				let msg = `提交失败 (HTTP ${res.status}).`;
				try {
					const b: any = await res.json();
					if (b?.error) msg = b.error;
				} catch {
					/* non-JSON */
				}
				errorById = { ...errorById, [recordId]: msg };
				return;
			}
			await invalidateAll();
		} catch (e) {
			errorById = { ...errorById, [recordId]: `网络错误：${(e as Error).message}` };
		} finally {
			busyId = null;
		}
	}
</script>

<PageShell
	eyebrow="Employee · Workplace"
	title="我的工作台"
	description="分配给你的任务，以及需要你填写并提交的 ISO 9001 记录。下载模板、填写说明后提交，等待 PM 审批。"
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

	<div class="space-y-4">
		{#each tasks as t (t.id)}
			<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<div class="flex flex-wrap items-center gap-2">
					<span class="rounded-full px-2 py-0.5 text-[11px] {statusColor(t.status)}">{statusLabel(t.status)}</span>
					<h3 class="text-sm font-semibold text-slate-900">{t.name}</h3>
					<a href={`/projects/${t.projectId}/tasks`} class="text-xs text-[var(--sf-green)] hover:underline">
						{t.projectName ?? '项目'} →
					</a>
					{#if !t.assignedToMe}
						<span class="text-[11px] text-slate-400">（你是某记录的责任人）</span>
					{/if}
					{#if t.endDate}
						<span class="ml-auto text-xs text-slate-500">截止 {t.endDate}</span>
					{/if}
				</div>

				{#if t.description}
					<p class="mt-2 whitespace-pre-wrap text-sm text-slate-600">{t.description}</p>
				{/if}

				<!-- Submission area -->
				{#if t.records.length > 0}
					<div class="mt-3 space-y-3 border-t border-slate-100 pt-3">
						<p class="text-xs font-semibold text-slate-600">需提交的 ISO 记录</p>
						{#each t.records as r (r.id)}
							<div class="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
								<div class="flex flex-wrap items-center gap-2">
									<span class="rounded-full px-2 py-0.5 text-[10px] {statusColor(r.status)}">{statusLabel(r.status)}</span>
									<span class="text-xs font-medium text-slate-700">{r.code ? r.code + ' · ' : ''}{r.name}</span>
									{#if r.requiresApproval}<span class="text-[10px] text-amber-600">需审批</span>{/if}
									{#if r.version > 1}<span class="text-[10px] text-slate-400">v{r.version}</span>{/if}
									{#if r.templateFileUrl}
										<a href={r.templateFileUrl} target="_blank" rel="noopener" class="ml-auto text-xs font-medium text-[var(--sf-green)] hover:underline">
											⬇ 下载模板{r.templateFileName ? `（${r.templateFileName}）` : ''}
										</a>
									{/if}
								</div>

								{#if r.status === 'rejected' && r.rejectedReason}
									<p class="mt-1.5 text-[11px] text-rose-600">退回原因：{r.rejectedReason}</p>
								{/if}

								{#if canSubmit(r.status)}
									<textarea
										rows="2"
										placeholder="填写说明 / 完成情况（提交给 PM 审阅）"
										value={notes[r.id] ?? r.fields ?? ''}
										oninput={(e) => (notes[r.id] = (e.currentTarget as HTMLTextAreaElement).value)}
										class="mt-2 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
									></textarea>
									{#if errorById[r.id]}
										<p class="mt-1 text-[11px] text-rose-600">{errorById[r.id]}</p>
									{/if}
									<div class="mt-1.5 flex justify-end">
										<button
											type="button"
											class="rounded-md bg-[var(--sf-green)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2f5e2c] disabled:opacity-60"
											disabled={busyId === r.id}
											onclick={() => submit(r.projectId, r.id)}
										>
											{busyId === r.id ? '提交中…' : '提交'}
										</button>
									</div>
								{:else}
									{#if r.fields}
										<p class="mt-1.5 whitespace-pre-wrap text-[11px] text-slate-500">已填：{r.fields}</p>
									{/if}
									{#if r.status === 'submitted'}
										<p class="mt-1 text-[11px] text-amber-600">已提交，等待 PM 审批。</p>
									{:else if r.status === 'approved'}
										<p class="mt-1 text-[11px] text-emerald-600">已通过审批。</p>
									{:else if r.status === 'waived'}
										<p class="mt-1 text-[11px] text-slate-500">已被豁免，无需提交。</p>
									{/if}
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<p class="mt-2 text-xs text-slate-400">此任务暂无需要你提交的 ISO 记录。</p>
				{/if}
			</div>
		{:else}
			<div class="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
				目前没有分配给你的任务。
			</div>
		{/each}
	</div>
</PageShell>
