<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { invalidateAll, goto } from '$app/navigation';

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
		responsibleUserId: string | null;
		responsibleName: string | null;
		templateFileUrl?: string | null;
		templateFileName?: string | null;
		fileUrl: string | null;
		fileName: string | null;
	};
	type Task = {
		id: string;
		projectId: string;
		projectName: string | null;
		name: string;
		description: string | null;
		status: string;
		startDate: string | null;
		endDate: string | null;
		taskType: string | null;
		submissionNote: string | null;
	};

	const task = $derived(data.task as Task);
	const records = $derived((data.records as WorkRecord[]) ?? []);
	const hasRequired = $derived(records.some((r) => r.isRequired));
	const isDone = $derived(task.status === 'completed');

	let recordNotes = $state<{ [id: string]: string }>({});
	let taskNote = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let hydrated = $state<string | null>(null);
	$effect(() => {
		if (hydrated === task.id) return;
		hydrated = task.id;
		taskNote = task.submissionNote ?? '';
		recordNotes = {};
	});

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
	const canSubmitRecord = (s: string) => ['not_started', 'draft', 'rejected'].includes(s);

	async function submit() {
		busy = true;
		error = null;
		try {
			const res = await fetch(`/api/projects/${task.projectId}/tasks/${task.id}/submit`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ note: taskNote || null, recordNotes })
			});
			if (!res.ok) {
				let msg = `提交失败 (HTTP ${res.status}).`;
				try {
					const b: any = await res.json();
					if (b?.error) msg = b.error;
				} catch {
					/* non-JSON */
				}
				error = msg;
				return;
			}
			await invalidateAll();
		} catch (e) {
			error = `网络错误：${(e as Error).message}`;
		} finally {
			busy = false;
		}
	}
</script>

<PageShell eyebrow="Employee · Workplace" title="任务详情" description="查看任务信息、填写并提交，或标记完成。">
	<a href="/employee/workplace" class="mb-4 inline-block text-sm text-[var(--sf-green)] hover:underline">← 返回工作台</a>

	<div class="space-y-4">
		<!-- Task header -->
		<div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
			<div class="flex flex-wrap items-center gap-2">
				<span class="rounded-full px-2 py-0.5 text-[11px] {statusColor(task.status)}">{statusLabel(task.status)}</span>
				<h2 class="text-base font-semibold text-slate-900">{task.name}</h2>
			</div>
			<dl class="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
				<div>
					<dt class="text-xs text-slate-500">所属项目</dt>
					<dd>
						<a href={`/projects/${task.projectId}/tasks`} class="text-[var(--sf-green)] hover:underline">{task.projectName ?? '项目'}</a>
					</dd>
				</div>
				<div>
					<dt class="text-xs text-slate-500">开始</dt>
					<dd class="text-slate-700">{task.startDate ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-xs text-slate-500">截止</dt>
					<dd class="text-slate-700">{task.endDate ?? '—'}</dd>
				</div>
			</dl>
			<div class="mt-3">
				<p class="text-xs text-slate-500">任务描述</p>
				<p class="mt-1 whitespace-pre-wrap text-sm text-slate-700">{task.description || '（无描述）'}</p>
			</div>
		</div>

		<!-- ISO records -->
		{#if records.length > 0}
			<div class="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm">
				<h3 class="text-sm font-semibold text-emerald-800">ISO 9001 记录</h3>
				<div class="mt-3 space-y-3">
					{#each records as r (r.id)}
						<div class="rounded-lg border border-slate-200 bg-white p-3">
							<div class="flex flex-wrap items-center gap-2">
								<span class="rounded-full px-2 py-0.5 text-[10px] {statusColor(r.status)}">{statusLabel(r.status)}</span>
								<span class="text-xs font-medium text-slate-700">{r.code ? r.code + ' · ' : ''}{r.name}</span>
								{#if r.requiresApproval}<span class="text-[10px] text-amber-600">需审批</span>{/if}
								{#if !r.isRequired}<span class="text-[10px] text-slate-400">非必需</span>{/if}
								{#if r.version > 1}<span class="text-[10px] text-slate-400">v{r.version}</span>{/if}
								{#if r.templateFileUrl}
									<a href={r.templateFileUrl} target="_blank" rel="noopener" class="ml-auto text-xs font-medium text-[var(--sf-green)] hover:underline">⬇ 下载模板</a>
								{/if}
							</div>
							{#if r.status === 'rejected' && r.rejectedReason}
								<p class="mt-1.5 text-[11px] text-rose-600">退回原因：{r.rejectedReason}</p>
							{/if}
							{#if canSubmitRecord(r.status) && !isDone}
								<textarea
									rows="2"
									placeholder="填写该记录的说明 / 完成情况"
									value={recordNotes[r.id] ?? r.fields ?? ''}
									oninput={(e) => (recordNotes[r.id] = (e.currentTarget as HTMLTextAreaElement).value)}
									class="mt-2 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
								></textarea>
							{:else if r.fields}
								<p class="mt-1.5 whitespace-pre-wrap text-[11px] text-slate-500">已填：{r.fields}</p>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Submission area (always present) -->
		{#if !isDone}
			<div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
				<h3 class="text-sm font-semibold text-slate-800">提交区</h3>
				<label class="mt-3 block">
					<span class="text-xs font-medium text-slate-500">说明 / 完成情况</span>
					<textarea bind:value={taskNote} rows="3" placeholder="描述你的完成情况，供 PM 审阅" class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"></textarea>
				</label>
				<div class="mt-3">
					<span class="text-xs font-medium text-slate-500">附件上传</span>
					<div class="mt-1 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center">
						<input type="file" disabled class="mx-auto block text-xs text-slate-400" />
						<p class="mt-1 text-[11px] text-slate-400">文件上传即将开放（后续支持邮件回传 / 附件入库），当前请填写说明。</p>
					</div>
				</div>
				{#if error}
					<p class="mt-2 text-xs text-rose-600">{error}</p>
				{/if}
				<div class="mt-4 flex justify-end">
					<button
						type="button"
						class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c] disabled:opacity-60"
						disabled={busy}
						onclick={submit}
					>
						{busy ? '提交中…' : hasRequired ? '提交并送 PM 审批' : '标记任务完成'}
					</button>
				</div>
			</div>
		{:else}
			<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-700 shadow-sm">
				✓ 任务已完成。
				{#if task.submissionNote}<span class="mt-1 block text-emerald-800/80">提交说明：{task.submissionNote}</span>{/if}
			</div>
		{/if}
	</div>
</PageShell>
