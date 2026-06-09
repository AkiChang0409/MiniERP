<script lang="ts">
	import { setAgentPageContext } from '$app-layer/ai-panel/state/context';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { computeUrgency } from '$modules/project';

	let { data } = $props();

	// Pick up an AI-generated plan that the create form stashed in
	// sessionStorage and materialise it as real tasks. One-shot — we wipe the
	// key as soon as we read it so a refresh doesn't double-create.
	let materializingPlan = $state(false);
	let materializeMessage = $state<string | null>(null);

	// --- AI Chat (Epic 7) — floating widget on the detail page -------------
	type ChatTurn = {
		role: 'user' | 'assistant';
		text: string;
		citations?: Array<{ kind: string; ref: string; excerpt?: string }>;
		needsHuman?: boolean;
	};
	let chatOpen = $state(false);
	let chatInput = $state('');
	let chatLoading = $state(false);
	let chatTurns = $state<ChatTurn[]>([]);
	let chatError = $state<string | null>(null);

	async function askProjectQuestion() {
		const q = chatInput.trim();
		if (!q) return;
		chatTurns = [...chatTurns, { role: 'user', text: q }];
		chatInput = '';
		chatLoading = true;
		chatError = null;
		try {
			const r = await fetch(`/api/projects/${data.project.id}/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ question: q })
			});
			const body = await r.json();
			const answer = body?.data?.answer ?? body?.answer;
			if (!r.ok || !answer) {
				chatError = body?.error ?? 'Could not answer.';
				return;
			}
			chatTurns = [
				...chatTurns,
				{
					role: 'assistant',
					text: answer.answer,
					citations: answer.citations,
					needsHuman: answer.needsHuman
				}
			];
		} catch (e) {
			chatError = (e as Error).message;
		} finally {
			chatLoading = false;
		}
	}

	// --- Docs Assistant (Epic 10) — turn an attachment into draft tasks ----
	let extractLoading = $state<string | null>(null);
	let extractMessage = $state<string | null>(null);
	async function extractTasksFromAttachment(att: { id: string; fileName: string; url: string }) {
		extractMessage = null;
		extractLoading = att.id;
		try {
			// First, ask the document-intake module for the raw text behind the
			// attachment. For project-side attachments stored in R2 directly we
			// don't have OCR, so we fall back to fetching the file contents as
			// text where possible (PDFs that are already text-extractable show up
			// here; image-only docs need the full intake pipeline).
			let rawText = '';
			try {
				const txtRes = await fetch(att.url);
				if (txtRes.ok) {
					const buf = await txtRes.arrayBuffer();
					rawText = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buf));
				}
			} catch {
				/* swallow — empty rawText will surface a clean error below */
			}
			if (!rawText.trim()) {
				extractMessage = `Cannot read "${att.fileName}" as text. For PDFs and images, upload via the AI Inbox so OCR runs first, then re-try here.`;
				return;
			}
			const r = await fetch(`/api/projects/${data.project.id}/extract-tasks`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ rawText })
			});
			const body = await r.json();
			const bundle = body?.data?.bundle ?? body?.bundle;
			if (!r.ok || !bundle) {
				extractMessage = body?.error ?? 'Extraction failed.';
				return;
			}
			// Promote each suggested task to a real task. Confidence < 0.5 is
			// dropped; everything else goes in and the user can groom from
			// there.
			let created = 0;
			for (const t of bundle.tasks ?? []) {
				if (t.confidence < 0.5) continue;
				const dueDate = t.dueDate ?? null;
				const startDate = new Date().toISOString().slice(0, 10);
				const r2 = await fetch(`/api/projects/${data.project.id}/tasks`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: t.name,
						description: t.description ?? null,
						startDate,
						endDate: dueDate
					})
				});
				if (r2.ok) created += 1;
			}
			extractMessage = `Extracted ${created} task suggestion${created === 1 ? '' : 's'} from "${att.fileName}". Review them on the Gantt.`;
			await invalidateAll();
		} catch (e) {
			extractMessage = (e as Error).message;
		} finally {
			extractLoading = null;
		}
	}
	onMount(async () => {
		try {
			const raw = sessionStorage.getItem('pendingProjectPlan');
			if (!raw) return;
			sessionStorage.removeItem('pendingProjectPlan');
			const plan = JSON.parse(raw) as {
				tasks: Array<{
					name: string;
					description?: string;
					durationDays: number;
					startOffsetDays?: number;
					dependsOnIndices?: number[];
					isMilestone?: boolean;
					estimatedHours?: number;
					stageName?: string;
				}>;
				stages?: string[];
				savedAt: number;
			};
			if (!plan?.tasks || plan.tasks.length === 0) return;
			// stale guard — only materialise plans saved in the last 5 minutes
			if (Date.now() - plan.savedAt > 5 * 60 * 1000) return;

			materializingPlan = true;
			const startBase = data.project.startDate
				? new Date(data.project.startDate)
				: new Date(data.project.createdAt);
			const createdIds: string[] = [];
			for (let i = 0; i < plan.tasks.length; i++) {
				const t = plan.tasks[i];
				const start = new Date(startBase);
				start.setDate(start.getDate() + (t.startOffsetDays ?? 0));
				const end = new Date(start);
				end.setDate(end.getDate() + Math.max(1, t.durationDays));
				const r = await fetch(`/api/projects/${data.project.id}/tasks`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: t.name,
						description: t.description ?? null,
						startDate: start.toISOString().slice(0, 10),
						endDate: end.toISOString().slice(0, 10),
						isMilestone: !!t.isMilestone,
						estimatedHours: t.estimatedHours ?? null
					})
				});
				if (r.ok) {
					const body = await r.json();
					createdIds.push(body?.data?.id ?? body?.id);
				}
			}
			// Best-effort dependency wiring once all tasks exist.
			for (let i = 0; i < plan.tasks.length; i++) {
				const deps = plan.tasks[i].dependsOnIndices ?? [];
				for (const depIdx of deps) {
					const fromId = createdIds[depIdx];
					const toId = createdIds[i];
					if (!fromId || !toId) continue;
					await fetch(`/api/projects/${data.project.id}/tasks/dependencies`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ fromTaskId: fromId, toTaskId: toId })
					}).catch(() => {});
				}
			}
			materializingPlan = false;
			materializeMessage = `Created ${createdIds.length} task${
				createdIds.length === 1 ? '' : 's'
			} from your AI plan.`;
			await invalidateAll();
		} catch (e) {
			materializingPlan = false;
			materializeMessage = `Failed to materialise plan: ${(e as Error).message}`;
		}
	});

	const urgency = $derived(
		computeUrgency({
			status: data.project.status,
			startDate: data.project.startDate,
			deadline: data.project.deadline,
			createdAt: data.project.createdAt
		})
	);
	const isOverdue = $derived(urgency.level === 'overdue');

	const statusLabel = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

	let newCommentBody = $state('');
	let newCollaboratorEmail = $state('');
	let newCollaboratorRole = $state('');
	let actionMessage = $state<string | null>(null);

	function fmtTime(iso: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' });
	}

	function escapeHtml(value: string): string {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function renderBody(body: string): string {
		// TKMGMT9 — visually highlight @mentions. Escape first to prevent XSS
		// since the result is rendered via {@html}.
		return escapeHtml(body).replace(
			/@([A-Za-z0-9_.+\-]+)/g,
			'<span class="rounded bg-emerald-100 px-1 text-emerald-700">@$1</span>'
		);
	}
	$effect(() => {
		setAgentPageContext({
			project_id: data.project.id,
			project_name: data.project.name
		});

		return () => {
			setAgentPageContext({});
		};
	});

	const projBase = $derived(`/projects/${data.project.id}`);

	const money = (value: number) =>
		new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(value ?? 0);

	const fyLabel = $derived.by(() => {
		const y = data.project.startDate
			? new Date(data.project.startDate).getFullYear()
			: new Date().getFullYear();
		return Number.isNaN(y) ? '' : `FY${y}`;
	});

	const profitMarginPct = $derived.by(() => {
		const r = data.breakdown.revenue;
		if (!r || r <= 0) return 0;
		return (data.profit / r) * 100;
	});

	const totalCost = $derived.by(
		() =>
			data.breakdown.purchaseCost + data.breakdown.staffCost + data.breakdown.expenseCost
	);

	const costShare = $derived.by(() => {
		const t = totalCost;
		if (!t || t <= 0) {
			return { purchase: 0, staff: 0, expense: 0 };
		}
		return {
			purchase: (data.breakdown.purchaseCost / t) * 100,
			staff: (data.breakdown.staffCost / t) * 100,
			expense: (data.breakdown.expenseCost / t) * 100
		};
	});

	type DetailItem = {
		id: string;
		label: string | null;
		date: string | null;
		status: string | null;
		amount: number;
	};

	let selectedDetailId = $state<string | null>(null);

	const detailGroups = $derived.by(
		(): Array<{
			id: string;
			title: string;
			description: string;
			total: number;
			items: DetailItem[];
			fallback: string;
		}> => [
			{
				id: 'revenue-details',
				title: 'Revenue Breakdown',
				description: 'Composed from customer invoices (invoices_out.total).',
				total: data.breakdown.revenue,
				items: data.details.revenueItems,
				fallback: 'No revenue invoice records yet.'
			},
			{
				id: 'purchase-details',
				title: 'Purchase Cost Breakdown',
				description: 'Composed from supplier invoices (invoices_in.amount).',
				total: data.breakdown.purchaseCost,
				items: data.details.purchaseItems,
				fallback: 'No supplier invoice records yet.'
			},
			{
				id: 'staff-details',
				title: 'Staff Cost Breakdown',
				description: 'Staff cost from payout_records (confirmed / paid, excluding dividend).',
				total: data.breakdown.staffCost,
				items: data.details.staffItems,
				fallback: 'No staff compensation records yet.'
			},
			{
				id: 'expense-details',
				title: 'Expense Cost Breakdown',
				description:
					'Project expenses. Sales Cost vs OpEx; totals feed gross vs net profit.',
				total: data.breakdown.expenseCost,
				items: data.details.expenseItems,
				fallback: 'No expense records yet.'
			}
		]
	);

	const selectedDetailGroup = $derived.by(
		() => detailGroups.find((group) => group.id === selectedDetailId) ?? null
	);

	const openDetail = (id: string) => {
		selectedDetailId = id;
	};

	const closeDetail = () => {
		selectedDetailId = null;
	};
</script>

<div class="space-y-6">
	<!-- Page heading -->
	<div>
		<h1 class="text-xl font-semibold text-slate-900">Project Dashboard</h1>
		<p class="mt-1 text-sm text-slate-500">Financial overview and P&L summary for this project.</p>
	</div>

	{#if actionMessage}
		<div class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
			{actionMessage}
		</div>
	{/if}

	{#if materializingPlan}
		<div class="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
			Creating tasks from your AI-generated plan…
		</div>
	{/if}
	{#if materializeMessage}
		<div class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
			{materializeMessage}
		</div>
	{/if}

	<!-- TKMGMT1/3/4 — Project overview card -->
	<section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-2">
					<span
						class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
						style={`background:${urgency.soft};color:${urgency.text}`}
						title={urgency.percentElapsed != null
							? `${urgency.percentElapsed}% of the time window has elapsed`
							: urgency.label}
					>
						<span class="h-1.5 w-1.5 rounded-full" style={`background:${urgency.fill}`}></span>
						{urgency.label}
						{#if urgency.daysUntilDeadline != null}
							<span class="opacity-70">
								· {urgency.daysUntilDeadline >= 0
									? `${urgency.daysUntilDeadline}d left`
									: `${Math.abs(urgency.daysUntilDeadline)}d overdue`}
							</span>
						{/if}
					</span>
					<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
						{statusLabel(data.project.status)}
					</span>
					{#if data.project.recurrenceFrequency}
						<span class="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
							⟳ {data.project.recurrenceFrequency}{data.project.recurrenceFrequency === 'custom'
								? ` (every ${data.project.recurrenceInterval ?? 1}d)`
								: ''}
						</span>
					{/if}
					{#if data.project.parentProjectId}
						<a
							class="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 hover:underline"
							href={`/projects/${data.project.parentProjectId}`}
						>
							sub-project
						</a>
					{/if}
				</div>
				<dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
					<div>
						<dt class="text-[11px] uppercase tracking-wide text-slate-500">Deadline</dt>
						<dd
							class={isOverdue
								? 'mt-0.5 text-base font-medium text-rose-600'
								: 'mt-0.5 text-base font-medium text-slate-800'}
						>
							{data.project.deadline ?? '—'}
							{#if isOverdue}<span class="ml-1 text-xs">(overdue)</span>{/if}
						</dd>
					</div>
					<div>
						<dt class="text-[11px] uppercase tracking-wide text-slate-500">Owner</dt>
						<dd class="mt-0.5 text-base font-medium text-slate-800">
							{#if data.owner}
								{data.owner.name || data.owner.email}
								{#if data.owner.name && data.owner.email}
									<span class="ml-1 text-xs font-normal text-slate-500">
										· {data.owner.email}
									</span>
								{/if}
							{:else}
								<span class="text-slate-400">Unassigned</span>
							{/if}
						</dd>
					</div>
					<div>
						<dt class="text-[11px] uppercase tracking-wide text-slate-500">Collaborators</dt>
						<dd class="mt-0.5 text-base font-medium text-slate-800">
							{data.collaborators.length}
						</dd>
					</div>
					<div>
						<dt class="text-[11px] uppercase tracking-wide text-slate-500">Sub-projects</dt>
						<dd class="mt-0.5 text-base font-medium text-slate-800">
							{data.subProjects.length}
						</dd>
					</div>
				</dl>
				{#if data.project.notes}
					<p class="mt-4 whitespace-pre-line rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
						<span class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Notes:</span>
						{data.project.notes}
					</p>
				{/if}
				{#if data.attachments && data.attachments.length > 0}
					<div class="mt-4">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
							Attachments ({data.attachments.length})
						</p>
						<ul class="mt-1 space-y-1">
							{#each data.attachments as att}
								<li class="flex flex-wrap items-center gap-2 text-sm">
									<a
										class="inline-flex items-center gap-1.5 text-[var(--sf-green)] hover:underline"
										href={att.url}
										target="_blank"
										rel="noreferrer"
									>
										📎 {att.fileName}
									</a>
									{#if att.sizeBytes}
										<span class="text-[11px] text-slate-400">
											· {(att.sizeBytes / 1024 / 1024).toFixed(2)} MB
										</span>
									{/if}
									{#if att.legacy}
										<span class="rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500">
											legacy
										</span>
									{/if}
									{#if data.canEdit && !att.legacy}
										<button
											type="button"
											class="ml-auto rounded border border-[var(--sf-green)] bg-[var(--sf-green-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--sf-green)] hover:bg-emerald-100 disabled:opacity-60"
											disabled={extractLoading === att.id}
											onclick={() => extractTasksFromAttachment(att)}
											title="AI suggests tasks from this document"
										>
											{extractLoading === att.id ? '…' : 'AI · Extract tasks'}
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
			<div class="flex flex-col items-end gap-2">
				<p class="text-[11px] text-slate-400">Edit scope: {data.scope}</p>
				{#if data.canEditCrucial && data.project.status !== 'completed'}
					<form
						method="POST"
						action="?/complete"
						use:enhance={() => {
							return async ({ result }) => {
								if (result.type === 'success') {
									await invalidateAll();
									actionMessage = result.data?.nextProjectId
										? `Marked completed — next instance #${result.data.nextProjectId} created.`
										: 'Marked completed.';
								} else if (result.type === 'failure') {
									actionMessage = (result.data as { message?: string })?.message ?? 'Failed';
								}
							};
						}}
					>
						<button
							type="submit"
							class="rounded-md border border-emerald-600 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
						>
							Mark Completed
						</button>
					</form>
				{/if}
			</div>
		</div>

		{#if data.subProjects.length > 0}
			<div class="mt-5 border-t border-slate-100 pt-4">
				<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Sub-projects</h3>
				<ul class="mt-2 divide-y divide-slate-100">
					{#each data.subProjects as sp}
						<li class="flex items-center justify-between py-2 text-sm">
							<a class="font-medium text-slate-700 hover:text-[var(--sf-green)]" href={`/projects/${sp.id}`}>
								{sp.name}
							</a>
							<span class="text-xs text-slate-500">
								{sp.deadline ?? '—'} · {statusLabel(sp.status)}
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</section>

	<!-- TKMGMT1/2/3 — Collaborators -->
	<section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
		<div class="flex items-baseline justify-between">
			<h2 class="text-sm font-medium text-slate-800">Collaborators</h2>
			<p class="text-xs text-slate-500">
				{data.collaborators.length} {data.collaborators.length === 1 ? 'person' : 'people'}
			</p>
		</div>
		{#if data.collaborators.length === 0}
			<p class="mt-3 text-sm text-slate-500">No collaborators yet.</p>
		{:else}
			<ul class="mt-3 divide-y divide-slate-100">
				{#each data.collaborators as c}
					<li class="flex items-center justify-between py-2 text-sm">
						<div>
							<p class="font-medium text-slate-800">{c.name}</p>
							<p class="text-xs text-slate-500">
								{c.email}{c.role ? ` · ${c.role}` : ''}
							</p>
						</div>
						{#if data.canEditCrucial}
							<form
								method="POST"
								action="?/removeCollaborator"
								use:enhance={() => {
									return async ({ result }) => {
										if (result.type === 'success') await invalidateAll();
									};
								}}
							>
								<input type="hidden" name="userId" value={c.userId} />
								<button
									type="submit"
									class="rounded border border-rose-200 px-2 py-1 text-[11px] text-rose-700 hover:bg-rose-50"
								>
									Remove
								</button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if data.canEditCrucial}
			<form
				class="mt-4 flex flex-wrap items-end gap-2"
				method="POST"
				action="?/addCollaborator"
				use:enhance={() => {
					return async ({ result }) => {
						if (result.type === 'success') {
							newCollaboratorEmail = '';
							newCollaboratorRole = '';
							await invalidateAll();
						} else if (result.type === 'failure') {
							actionMessage = (result.data as { message?: string })?.message ?? 'Failed';
						}
					};
				}}
			>
				<label class="flex-1 space-y-1 text-xs">
					<span class="text-slate-600">Collaborator email</span>
					<input
						name="email"
						type="email"
						required
						placeholder="someone@example.com"
						bind:value={newCollaboratorEmail}
						class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
					/>
				</label>
				<label class="w-40 space-y-1 text-xs">
					<span class="text-slate-600">Role (optional)</span>
					<input
						name="role"
						placeholder="reviewer"
						bind:value={newCollaboratorRole}
						class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
					/>
				</label>
				<button
					type="submit"
					class="rounded-md bg-[var(--sf-green)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2f5e2c]"
				>
					Add
				</button>
			</form>
		{/if}
	</section>

	<!-- TKMGMT9 — Comments -->
	<section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
		<div class="flex items-baseline justify-between">
			<h2 class="text-sm font-medium text-slate-800">Discussion</h2>
			<p class="text-xs text-slate-500">
				{data.comments.length} comment{data.comments.length === 1 ? '' : 's'}
			</p>
		</div>
		{#if data.canEdit}
			<form
				class="mt-3"
				method="POST"
				action="?/comment"
				use:enhance={() => {
					return async ({ result }) => {
						if (result.type === 'success') {
							newCommentBody = '';
							await invalidateAll();
						} else if (result.type === 'failure') {
							actionMessage = (result.data as { message?: string })?.message ?? 'Failed';
						}
					};
				}}
			>
				<textarea
					name="body"
					rows="3"
					required
					placeholder="Use @email to tag a teammate…"
					bind:value={newCommentBody}
					class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
				></textarea>
				<div class="mt-2 flex justify-end">
					<button
						type="submit"
						class="rounded-md bg-[var(--sf-green)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2f5e2c]"
					>
						Post comment
					</button>
				</div>
			</form>
		{:else}
			<p class="mt-2 text-xs text-slate-500">
				Only owners and collaborators can post comments.
			</p>
		{/if}

		{#if data.comments.length === 0}
			<p class="mt-4 text-sm text-slate-500">No comments yet.</p>
		{:else}
			<ul class="mt-4 space-y-3">
				{#each data.comments as c}
					<li class="rounded-md border border-slate-200 bg-slate-50/40 p-3">
						<div class="flex items-baseline justify-between gap-2">
							<p class="text-sm font-medium text-slate-800">
								{c.authorName ?? c.authorEmail ?? 'Anonymous'}
							</p>
							<p class="text-[11px] text-slate-500">{fmtTime(c.createdAt)}</p>
						</div>
						<p class="mt-1.5 whitespace-pre-line text-sm text-slate-700">{@html renderBody(c.body)}</p>
						{#if c.mentions.length > 0}
							<p class="mt-2 text-[11px] text-slate-500">
								Mentioned: {c.mentions.map((m: { email: string }) => m.email).join(', ')}
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Financial overview -->
	<section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
		<div
			class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4"
		>
			<div>
				<h2 class="text-[13px] font-medium text-slate-900">Financial Overview</h2>
				<p class="mt-0.5 text-xs text-slate-500">Click any metric to view detail breakdown.</p>
			</div>
			{#if fyLabel}
				<span class="rounded-full px-2 py-0.5 text-[11px] font-medium" style="background: #e6f1fb; color: #185fa5;">
					{fyLabel}
				</span>
			{/if}
		</div>
		<div class="grid grid-cols-2 gap-px bg-slate-200 xl:grid-cols-4">
			<button
				type="button"
				class="bg-white px-5 py-4 text-left transition hover:bg-slate-50"
				onclick={() => openDetail('revenue-details')}
			>
				<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Revenue</p>
				<p class="mt-1.5 text-[22px] font-medium text-slate-900">{money(data.breakdown.revenue)}</p>
				<p class="mt-1 text-[11px] text-slate-500">
					{data.metricDocCounts.revenue} invoice{data.metricDocCounts.revenue === 1 ? '' : 's'}
				</p>
			</button>
			<button
				type="button"
				class="bg-white px-5 py-4 text-left transition hover:bg-slate-50"
				onclick={() => openDetail('purchase-details')}
			>
				<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Purchase Cost</p>
				<p class="mt-1.5 text-[22px] font-medium text-slate-900">
					{money(data.breakdown.purchaseCost)}
				</p>
				<p class="mt-1 text-[11px] text-slate-500">
					{data.metricDocCounts.purchase} supplier invoice{data.metricDocCounts.purchase === 1 ? '' : 's'}
				</p>
			</button>
			<button
				type="button"
				class="bg-white px-5 py-4 text-left transition hover:bg-slate-50"
				onclick={() => openDetail('staff-details')}
			>
				<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Staff Cost</p>
				<p class="mt-1.5 text-[22px] font-medium text-slate-900">{money(data.breakdown.staffCost)}</p>
				<p class="mt-1 text-[11px] text-slate-500">
					{data.metricDocCounts.staff} compensation{data.metricDocCounts.staff === 1 ? '' : 's'}
				</p>
			</button>
			<button
				type="button"
				class="bg-white px-5 py-4 text-left transition hover:bg-slate-50"
				onclick={() => openDetail('expense-details')}
			>
				<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Expense Cost</p>
				<p class="mt-1.5 text-[22px] font-medium text-slate-900">
					{money(data.breakdown.expenseCost)}
				</p>
				<p class="mt-1 text-[11px] text-slate-500">
					{data.metricDocCounts.expense} record{data.metricDocCounts.expense === 1 ? '' : 's'} · Sales Cost{' '}
					{money(data.breakdown.expenseSalesCost)} · OpEx {money(data.breakdown.expenseOpexCost)}
				</p>
			</button>
		</div>
		<div class="grid grid-cols-1 gap-px bg-slate-200 border-t border-slate-200 md:grid-cols-3">
			<div class="px-5 py-3.5" style="background: var(--sf-green-soft);">
				<p class="text-[11px] font-medium uppercase tracking-wide text-[var(--sf-green)] opacity-80">
					Gross / Net Profit
				</p>
				<p class="mt-1 text-sm font-medium text-emerald-950">
					Gross {money(data.grossProfit)}
				</p>
				<p
					class="mt-0.5 text-xl font-medium {data.profit >= 0 ? 'text-emerald-900' : 'text-rose-700'}"
				>
					Net {money(data.profit)}
				</p>
				<p class="mt-0.5 text-xs text-[var(--sf-green)]">Net = Gross - OpEx expenses</p>
			</div>
			<div class="px-5 py-3.5" style="background: var(--sf-green-soft);">
				<p class="text-[11px] font-medium uppercase tracking-wide text-[var(--sf-green)] opacity-80">
					Profit Margin
				</p>
				<p class="mt-1 text-xl font-medium text-emerald-900">
					{profitMarginPct.toFixed(1)}%
				</p>
				<p class="mt-0.5 text-xs text-[var(--sf-green)]">Net Profit / Revenue</p>
			</div>
			<div class="bg-slate-50 px-5 py-3.5">
				<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Cost Breakdown</p>
				<div class="mt-2 space-y-1">
					<div class="flex items-center gap-2">
						<span class="w-20 shrink-0 text-[11px] text-slate-600">Purchase</span>
						<div class="h-1 flex-1 overflow-hidden rounded-full bg-slate-200">
							<div
								class="h-full rounded-full bg-sky-600"
								style={`width:${costShare.purchase}%`}
							></div>
						</div>
						<span class="w-9 shrink-0 text-right text-[11px] text-slate-600">
							{costShare.purchase.toFixed(0)}%
						</span>
					</div>
					<div class="flex items-center gap-2">
						<span class="w-20 shrink-0 text-[11px] text-slate-600">Staff</span>
						<div class="h-1 flex-1 overflow-hidden rounded-full bg-slate-200">
							<div
								class="h-full rounded-full bg-amber-500"
								style={`width:${costShare.staff}%`}
							></div>
						</div>
						<span class="w-9 shrink-0 text-right text-[11px] text-slate-600">
							{costShare.staff.toFixed(0)}%
						</span>
					</div>
					<div class="flex items-center gap-2">
						<span class="w-20 shrink-0 text-[11px] text-slate-600">Expense</span>
						<div class="h-1 flex-1 overflow-hidden rounded-full bg-slate-200">
							<div
								class="h-full rounded-full bg-pink-700"
								style={`width:${costShare.expense}%`}
							></div>
						</div>
						<span class="w-9 shrink-0 text-right text-[11px] text-slate-600">
							{costShare.expense.toFixed(0)}%
						</span>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Quick Access Cards -->
	<section>
		<h2 class="mb-4 text-sm font-medium text-slate-700">Quick Access</h2>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<a
				href="{projBase}/documents"
				class="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[var(--sf-green)] hover:shadow-md"
			>
				<div class="flex items-center justify-between">
					<span class="text-2xl opacity-60">-</span>
					<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 group-hover:bg-[var(--sf-green-soft)] group-hover:text-[var(--sf-green)]">
						{data.submoduleCounts.contracts + data.submoduleCounts.quotations + data.submoduleCounts.purchaseOrders}
					</span>
				</div>
				<h3 class="mt-3 font-medium text-slate-900 group-hover:text-[var(--sf-green)]">Documents</h3>
				<p class="mt-1 text-xs text-slate-500">Contracts, quotations, purchase orders</p>
			</a>

			<a
				href="{projBase}/expenses"
				class="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[var(--sf-green)] hover:shadow-md"
			>
				<div class="flex items-center justify-between">
					<span class="text-2xl opacity-60">-</span>
					<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 group-hover:bg-[var(--sf-green-soft)] group-hover:text-[var(--sf-green)]">
						{data.submoduleCounts.expenses}
					</span>
				</div>
				<h3 class="mt-3 font-medium text-slate-900 group-hover:text-[var(--sf-green)]">Expenses</h3>
				<p class="mt-1 text-xs text-slate-500">Project expense claims & receipts</p>
			</a>

			<a
				href="{projBase}/revenue"
				class="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[var(--sf-green)] hover:shadow-md"
			>
				<div class="flex items-center justify-between">
					<span class="text-2xl opacity-60">¥</span>
					<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 group-hover:bg-[var(--sf-green-soft)] group-hover:text-[var(--sf-green)]">
						{data.metricDocCounts.revenue}
					</span>
				</div>
				<h3 class="mt-3 font-medium text-slate-900 group-hover:text-[var(--sf-green)]">Revenue</h3>
				<p class="mt-1 text-xs text-slate-500">Customer invoices & billing</p>
			</a>

			<a
				href="{projBase}/employees"
				class="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[var(--sf-green)] hover:shadow-md"
			>
				<div class="flex items-center justify-between">
					<span class="text-2xl opacity-60">-</span>
					<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 group-hover:bg-[var(--sf-green-soft)] group-hover:text-[var(--sf-green)]">
						{data.metricDocCounts.staff}
					</span>
				</div>
				<h3 class="mt-3 font-medium text-slate-900 group-hover:text-[var(--sf-green)]">Team & Cost</h3>
				<p class="mt-1 text-xs text-slate-500">Team members & compensation</p>
			</a>
		</div>
	</section>
</div>

{#if selectedDetailGroup}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button
			type="button"
			class="absolute inset-0 bg-[var(--sf-green)]/40"
			aria-label="Close detail dialog"
			onclick={closeDetail}
		></button>
		<div
			class="relative max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="detail-dialog-title"
		>
			<div class="border-b border-slate-200 bg-slate-50 px-4 py-3">
				<div class="flex items-start justify-between gap-4">
					<div>
						<h3 id="detail-dialog-title" class="text-base font-semibold text-slate-900">
							{selectedDetailGroup.title}
						</h3>
						<p class="text-xs text-slate-500">{selectedDetailGroup.description}</p>
					</div>
					<div class="flex shrink-0 items-start gap-3">
						<div class="text-right">
							<p class="text-xs text-slate-500">Subtotal</p>
							<p class="text-sm font-semibold text-slate-900">{money(selectedDetailGroup.total)}</p>
						</div>
						<button
							type="button"
							class="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
							onclick={closeDetail}
						>
							Close
						</button>
					</div>
				</div>
			</div>
			<div class="max-h-[60vh] overflow-auto">
				<table class="min-w-full divide-y divide-slate-200 text-sm">
					<thead class="bg-white text-left text-slate-600">
						<tr>
							<th class="px-4 py-3">Ref</th>
							<th class="px-4 py-3">Date</th>
							<th class="px-4 py-3">Status / Note</th>
							<th class="px-4 py-3 text-right">Amount</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-100">
						{#if selectedDetailGroup.items.length === 0}
							<tr>
								<td class="px-4 py-8 text-center text-slate-500" colspan="4">
									{selectedDetailGroup.fallback}
								</td>
							</tr>
						{:else}
							{#each selectedDetailGroup.items as item}
								<tr class="hover:bg-slate-50">
									<td class="px-4 py-3 font-medium text-slate-800">{item.label || item.id}</td>
									<td class="px-4 py-3 text-slate-600">{item.date || '-'}</td>
									<td class="px-4 py-3 text-slate-600">{item.status || '-'}</td>
									<td class="px-4 py-3 text-right text-slate-800">{money(item.amount)}</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>
	</div>
{/if}

<!-- AI Chat widget (Epic 7) — floating bottom-right -->
<div class="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
	{#if chatOpen}
		<div class="w-80 max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-xl">
			<div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
				<div>
					<p class="text-[11px] font-semibold uppercase tracking-wide text-[var(--sf-green)]">
						Ask this project
					</p>
					<p class="text-[10px] text-slate-500">Powered by AI · grounded in this project's data</p>
				</div>
				<button
					type="button"
					class="rounded-md p-1 text-slate-500 hover:bg-slate-100"
					onclick={() => (chatOpen = false)}
					aria-label="Close chat"
				>
					×
				</button>
			</div>
			<div class="max-h-72 overflow-y-auto px-3 py-2 text-[13px]">
				{#if chatTurns.length === 0}
					<p class="py-6 text-center text-slate-500">
						Try "What's overdue?" or "Who owns the survey task?"
					</p>
				{:else}
					{#each chatTurns as turn, i (i)}
						<div class="mb-3 {turn.role === 'user' ? 'text-right' : ''}">
							<div
								class="inline-block max-w-[85%] rounded-lg px-3 py-2 {turn.role === 'user'
									? 'bg-[var(--sf-green)] text-white'
									: 'bg-slate-100 text-slate-800'}"
							>
								{turn.text}
							</div>
							{#if turn.role === 'assistant' && turn.citations && turn.citations.length > 0}
								<p class="mt-1 text-[10px] text-slate-500">
									Refs: {turn.citations.map((c) => `${c.kind}:${c.ref.slice(0, 8)}`).join(', ')}
								</p>
							{/if}
							{#if turn.role === 'assistant' && turn.needsHuman}
								<p class="mt-1 text-[10px] text-amber-700">
									⚠ AI flagged this as outside its knowledge — consider asking a teammate.
								</p>
							{/if}
						</div>
					{/each}
				{/if}
				{#if chatError}
					<p class="text-[11px] text-rose-700">{chatError}</p>
				{/if}
			</div>
			<form
				class="flex gap-1 border-t border-slate-200 p-2"
				onsubmit={(e) => {
					e.preventDefault();
					askProjectQuestion();
				}}
			>
				<input
					type="text"
					class="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
					placeholder="Ask a question…"
					bind:value={chatInput}
				/>
				<button
					type="submit"
					class="rounded-md bg-[var(--sf-green)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2f5e2c] disabled:opacity-60"
					disabled={chatLoading || !chatInput.trim()}
				>
					{chatLoading ? '…' : 'Ask'}
				</button>
			</form>
		</div>
	{/if}
	<button
		type="button"
		class="rounded-full bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-[#2f5e2c]"
		onclick={() => (chatOpen = !chatOpen)}
	>
		{chatOpen ? 'Hide chat' : '💬 Ask this project'}
	</button>
</div>

{#if extractMessage}
	<div class="fixed bottom-20 left-4 z-40 max-w-md rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 shadow">
		{extractMessage}
		<button
			type="button"
			class="ml-2 text-[11px] text-emerald-700 underline"
			onclick={() => (extractMessage = null)}
		>
			dismiss
		</button>
	</div>
{/if}

