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
	const isDone = $derived(task.status === 'completed');
	// Already submitted and awaiting PM review — the assignee can't resubmit until
	// it's sent back (a rejected ISO record drops the task back to `ongoing`).
	const awaitingReview = $derived(task.status === 'under_review');

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
				let msg = `Submission failed (HTTP ${res.status}).`;
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
			error = `Network error: ${(e as Error).message}`;
		} finally {
			busy = false;
		}
	}
</script>

<PageShell eyebrow="Employee · Workplace" title="Task Detail" description="Review task information, fill in required records, submit for review, or mark work complete.">
	<a href="/employee/workplace" class="mb-4 inline-block text-sm text-[var(--sf-green)] hover:underline">← Back to workplace</a>

	<div class="space-y-4">
		<!-- Task header -->
		<div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
			<div class="flex flex-wrap items-center gap-2">
				<span class="rounded-full px-2 py-0.5 text-[11px] {statusColor(task.status)}">{statusLabel(task.status)}</span>
				<h2 class="text-base font-semibold text-slate-900">{task.name}</h2>
			</div>
			<dl class="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
				<div>
					<dt class="text-xs text-slate-500">Project</dt>
					<dd>
						<a href={`/projects/${task.projectId}/tasks`} class="text-[var(--sf-green)] hover:underline">{task.projectName ?? 'Project'}</a>
					</dd>
				</div>
				<div>
					<dt class="text-xs text-slate-500">Start</dt>
					<dd class="text-slate-700">{task.startDate ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-xs text-slate-500">Due</dt>
					<dd class="text-slate-700">{task.endDate ?? '—'}</dd>
				</div>
			</dl>
			<div class="mt-3">
				<p class="text-xs text-slate-500">Task description</p>
				<p class="mt-1 whitespace-pre-wrap text-sm text-slate-700">{task.description || '(No description)'}</p>
			</div>
		</div>

		<!-- ISO records -->
		{#if records.length > 0}
			<div class="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm">
				<h3 class="text-sm font-semibold text-emerald-800">ISO 9001 Records</h3>
				<div class="mt-3 space-y-3">
					{#each records as r (r.id)}
						<div class="rounded-lg border border-slate-200 bg-white p-3">
							<div class="flex flex-wrap items-center gap-2">
								<span class="rounded-full px-2 py-0.5 text-[10px] {statusColor(r.status)}">{statusLabel(r.status)}</span>
								<span class="text-xs font-medium text-slate-700">{r.code ? r.code + ' · ' : ''}{r.name}</span>
								{#if r.requiresApproval}<span class="text-[10px] text-amber-600">Approval required</span>{/if}
								{#if !r.isRequired}<span class="text-[10px] text-slate-400">Optional</span>{/if}
								{#if r.version > 1}<span class="text-[10px] text-slate-400">v{r.version}</span>{/if}
								{#if r.templateFileUrl}
									<a href={r.templateFileUrl} target="_blank" rel="noopener" class="ml-auto text-xs font-medium text-[var(--sf-green)] hover:underline">⬇ Download template</a>
								{/if}
							</div>
							{#if r.status === 'rejected' && r.rejectedReason}
								<p class="mt-1.5 text-[11px] text-rose-600">Rejection reason: {r.rejectedReason}</p>
							{/if}
							{#if canSubmitRecord(r.status) && !isDone && !awaitingReview}
								<textarea
									rows="2"
									placeholder="Add notes or completion details for this record"
									value={recordNotes[r.id] ?? r.fields ?? ''}
									oninput={(e) => (recordNotes[r.id] = (e.currentTarget as HTMLTextAreaElement).value)}
									class="mt-2 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
								></textarea>
							{:else if r.fields}
								<p class="mt-1.5 whitespace-pre-wrap text-[11px] text-slate-500">Filled: {r.fields}</p>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Submission area (always present) -->
		{#if isDone}
			<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-700 shadow-sm">
				✓ Task completed.
				{#if task.submissionNote}<span class="mt-1 block text-emerald-800/80">Submission note: {task.submissionNote}</span>{/if}
			</div>
		{:else if awaitingReview}
			<div class="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700 shadow-sm">
				⏳ Submitted and waiting for PM review.
				{#if task.submissionNote}<span class="mt-1 block text-amber-800/80">Submission note: {task.submissionNote}</span>{/if}
				<span class="mt-1 block text-[12px] text-amber-700/80">If rejected, this task will return to In progress and can be resubmitted here.</span>
			</div>
		{:else}
			<div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
				<h3 class="text-sm font-semibold text-slate-800">Submission</h3>
				<label class="mt-3 block">
					<span class="text-xs font-medium text-slate-500">Notes / completion details</span>
					<textarea bind:value={taskNote} rows="3" placeholder="Describe your completion details for PM review" class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"></textarea>
				</label>
				<div class="mt-3">
					<span class="text-xs font-medium text-slate-500">Attachment upload</span>
					<div class="mt-1 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center">
						<input type="file" disabled class="mx-auto block text-xs text-slate-400" />
						<p class="mt-1 text-[11px] text-slate-400">File upload is coming soon. For now, add notes in the submission field.</p>
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
						{busy ? 'Submitting...' : 'Submit for PM review'}
					</button>
				</div>
			</div>
		{/if}
	</div>
</PageShell>
