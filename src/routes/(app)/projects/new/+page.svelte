<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { agentPrefill, consumePrefill, parseDateToPrefill } from '$app-layer/ai-panel/state/prefill';

	let { data, form } = $props();

	let projectName = $state('');
	let selectedCustomerId = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let deadline = $state('');
	let description = $state('');
	let notes = $state('');
	let status = $state('unassigned');
	let ownerId = $state(data.currentUser?.id ?? '');
	let parentProjectId = $state('');
	let recurrenceFrequency = $state('');
	let recurrenceInterval = $state<number | ''>('');
	let collabSearch = $state('');
	let selectedCollaborators = $state<Array<{ id: string; email: string; name: string; role: string }>>([]);

	// TKMGMT1 v2 — drag-and-drop attachments (multi-file queue).
	// Files are accumulated client-side and sent to the server with the rest
	// of the form. The server uploads them to R2 and persists one
	// `project_attachments` row per file.
	const ALLOWED_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg'];
	const ACCEPT_ATTR =
		'.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg';
	const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

	let attachmentInput = $state<HTMLInputElement | null>(null);
	let attachmentFiles = $state<File[]>([]);
	let attachmentError = $state<string | null>(null);
	let dragActive = $state(false);

	function extOf(name: string): string {
		const m = /\.([a-zA-Z0-9]+)$/.exec(name);
		return m ? m[1].toLowerCase() : '';
	}

	function formatBytes(n: number): string {
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		return `${(n / 1024 / 1024).toFixed(2)} MB`;
	}

	function fileEmoji(name: string): string {
		const ext = extOf(name);
		if (ext === 'pdf') return '📕';
		if (ext === 'doc' || ext === 'docx') return '📘';
		if (ext === 'xls' || ext === 'xlsx') return '📗';
		if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return '🖼️';
		return '📄';
	}

	function fileKey(file: File): string {
		return `${file.name}::${file.size}::${file.lastModified}`;
	}

	function syncInput() {
		// Mirror the queued files back into the hidden <input> so the form
		// submission carries them as the multi-valued `files` field.
		if (!attachmentInput) return;
		const dt = new DataTransfer();
		for (const f of attachmentFiles) dt.items.add(f);
		attachmentInput.files = dt.files;
	}

	function enqueueFiles(incoming: FileList | File[] | null) {
		if (!incoming || incoming.length === 0) return;
		attachmentError = null;
		const seen = new Set(attachmentFiles.map(fileKey));
		const errors: string[] = [];
		const next: File[] = [...attachmentFiles];
		for (const file of Array.from(incoming)) {
			const ext = extOf(file.name);
			if (!ALLOWED_EXTS.includes(ext)) {
				errors.push(`"${file.name}" — unsupported type "${ext || 'unknown'}"`);
				continue;
			}
			if (file.size === 0) {
				errors.push(`"${file.name}" — empty file`);
				continue;
			}
			if (file.size > MAX_ATTACHMENT_BYTES) {
				errors.push(`"${file.name}" — ${formatBytes(file.size)} > 15 MB`);
				continue;
			}
			const k = fileKey(file);
			if (seen.has(k)) continue;
			seen.add(k);
			next.push(file);
		}
		attachmentFiles = next;
		if (errors.length > 0) attachmentError = errors.join(' · ');
		syncInput();
	}

	function removeQueued(target: File) {
		const k = fileKey(target);
		attachmentFiles = attachmentFiles.filter((f) => fileKey(f) !== k);
		syncInput();
	}

	function onDragOver(event: DragEvent) {
		event.preventDefault();
		dragActive = true;
	}

	function onDragLeave(event: DragEvent) {
		event.preventDefault();
		dragActive = false;
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragActive = false;
		enqueueFiles(event.dataTransfer?.files ?? null);
	}

	function onInputChange(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		enqueueFiles(target.files);
		// Reset the native input so the same file can be re-picked if removed
		// from the queue and then chosen again.
		target.value = '';
		syncInput();
	}

	// --- AI Project Manager (Epic 1) ---------------------------------------
	type PlanTask = {
		name: string;
		description?: string;
		durationDays: number;
		startOffsetDays?: number;
		dependsOnIndices?: number[];
		isMilestone?: boolean;
		estimatedHours?: number;
		stageName?: string;
	};

	let aiPrompt = $state('');
	let aiLoading = $state(false);
	let aiError = $state<string | null>(null);
	let aiPlanTasks = $state<PlanTask[]>([]);
	let aiPlanStages = $state<string[]>([]);
	let aiConfidence = $state<number | null>(null);

	async function generatePlan() {
		aiError = null;
		aiLoading = true;
		try {
			const res = await fetch('/api/projects/generate-plan', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prompt: aiPrompt,
					knownStartDate: startDate || null,
					knownDeadline: deadline || null
				})
			});
			const body: any = await res.json();
			if (!res.ok) {
				aiError = body?.error || body?.message || 'Plan generation failed.';
				return;
			}
			const plan = body?.data?.plan ?? body?.plan;
			if (!plan) {
				aiError = 'No plan returned.';
				return;
			}
			projectName = plan.projectName;
			if (plan.description) description = plan.description;
			aiPlanTasks = plan.tasks;
			aiPlanStages = plan.stages ?? [];
			aiConfidence = plan.confidence;
			if (!deadline && plan.totalDurationDays) {
				const start = new Date(startDate || new Date().toISOString().slice(0, 10));
				start.setDate(start.getDate() + plan.totalDurationDays);
				deadline = start.toISOString().slice(0, 10);
			}
		} catch (e) {
			aiError = (e as Error).message;
		} finally {
			aiLoading = false;
		}
	}

	// After the project is saved, the server action redirects to /projects/[id].
	// We piggy-back on `form?.ok` from SvelteKit to materialise tasks via the
	// API. Since the form does a 303 redirect we can't intercept post-save
	// inside the same page — so we stash the plan in sessionStorage and the
	// detail page picks it up. Simpler than passing it through the URL.
	$effect(() => {
		if (aiPlanTasks.length > 0) {
			try {
				sessionStorage.setItem(
					'pendingProjectPlan',
					JSON.stringify({
						tasks: aiPlanTasks,
						stages: aiPlanStages,
						savedAt: Date.now()
					})
				);
			} catch {
				/* private mode — ignore */
			}
		}
	});

	let lastPrefillVersion = $state(-1);

	const collaboratorRolesJson = $derived(
		JSON.stringify(
			Object.fromEntries(selectedCollaborators.map((c) => [c.id, c.role]))
		)
	);

	const filteredUsers = $derived.by(() => {
		const needle = collabSearch.trim().toLowerCase();
		const already = new Set(selectedCollaborators.map((c) => c.id));
		const pool = (data.users ?? []).filter(
			(u: { id: string }) => !already.has(u.id) && u.id !== ownerId
		);
		if (!needle) return pool.slice(0, 8);
		return pool
			.filter(
				(u: { email: string; name: string }) =>
					u.email.toLowerCase().includes(needle) || u.name.toLowerCase().includes(needle)
			)
			.slice(0, 8);
	});

	function addCollaborator(u: { id: string; email: string; name: string }) {
		if (selectedCollaborators.some((c) => c.id === u.id)) return;
		selectedCollaborators = [
			...selectedCollaborators,
			{ id: u.id, email: u.email, name: u.name, role: '' }
		];
		collabSearch = '';
	}

	function removeCollaborator(id: string) {
		selectedCollaborators = selectedCollaborators.filter((c) => c.id !== id);
	}

	$effect(() => {
		const state = $agentPrefill;
		if (state.version === lastPrefillVersion) return;
		lastPrefillVersion = state.version;

		const prefill = consumePrefill();
		if (Object.keys(prefill).length === 0) return;

		if (typeof prefill.project_name === 'string') projectName = prefill.project_name;
		if (prefill.start_date !== undefined) {
			const parsed = parseDateToPrefill(prefill.start_date);
			if (parsed) startDate = parsed;
		}
		if (prefill.end_date !== undefined) {
			const parsed = parseDateToPrefill(prefill.end_date);
			if (parsed) endDate = parsed;
		}
		if (typeof prefill.description === 'string') description = prefill.description;
		if (typeof prefill.customer_name === 'string') {
			const needle = prefill.customer_name.toLowerCase();
			const match = data.customers.find(
				(c: { id: string; name: string }) =>
					c.name.toLowerCase() === needle || c.name.toLowerCase().includes(needle)
			);
			if (match) selectedCustomerId = match.id;
		}
	});
</script>

<PageShell
	eyebrow="Project Management"
	title="Create Project"
	description="Capture all the details that downstream tracking, calendar, and dashboard views rely on."
>
	<!-- AI Project Manager (Epic 1) — drop the high-level description here and
	     the model returns an editable plan that fills the form below. -->
	<section class="rounded-xl border border-[var(--sf-green)] bg-[var(--sf-green-soft)] p-5 shadow-sm">
		<div class="flex items-start justify-between gap-3">
			<div>
				<p class="text-[11px] font-semibold uppercase tracking-wide text-[var(--sf-green)]">
					AI Assist · optional
				</p>
				<h2 class="mt-1 text-sm font-medium text-slate-900">
					Describe the project in plain English
				</h2>
				<p class="mt-1 text-[12px] text-slate-600">
					e.g. <em>"Renovate the beachfront restaurant by June, includes kitchen refit and
					rebranding"</em>. The plan is editable — you stay in control.
				</p>
			</div>
			{#if aiConfidence != null}
				<span class="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[var(--sf-green)]">
					Confidence {Math.round(aiConfidence * 100)}%
				</span>
			{/if}
		</div>

		<div class="mt-3 flex flex-col gap-2 sm:flex-row">
			<textarea
				class="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
				rows="2"
				placeholder="High-level description…"
				bind:value={aiPrompt}
			></textarea>
			<button
				type="button"
				class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c] disabled:opacity-60"
				disabled={aiLoading || !aiPrompt.trim()}
				onclick={generatePlan}
			>
				{aiLoading ? 'Generating…' : 'Generate plan'}
			</button>
		</div>

		{#if aiError}
			<p class="mt-2 text-[11px] text-rose-700">{aiError}</p>
		{/if}

		{#if aiPlanTasks.length > 0}
			<div class="mt-4 rounded-md border border-slate-200 bg-white p-3">
				<p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
					Suggested tasks · {aiPlanTasks.length}
				</p>
				<ul class="mt-2 space-y-1">
					{#each aiPlanTasks as t, i}
						<li class="flex items-baseline gap-2 text-[12px]">
							<span class="w-6 text-right text-slate-400">{i + 1}.</span>
							<span class="flex-1 text-slate-700">
								{t.name}
								{#if t.isMilestone}<span class="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-800">milestone</span>{/if}
							</span>
							<span class="text-slate-500">{t.durationDays}d</span>
						</li>
					{/each}
				</ul>
				<p class="mt-2 text-[11px] text-slate-500">
					Tasks will be created after the project is saved.
				</p>
			</div>
		{/if}
	</section>

	<form
		class="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
		method="POST"
		enctype="multipart/form-data"
	>
		{#if form?.message}
			<p class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
				{form.message}
			</p>
		{/if}

		<!-- Core identity -->
		<section class="space-y-4">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Basics</h3>
			<div class="grid gap-4 md:grid-cols-2">
				<label class="space-y-1 text-sm md:col-span-2">
					<span class="text-slate-700">Project name <span class="text-rose-600">*</span></span>
					<input
						name="name"
						required
						class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
						placeholder="e.g. 2026 Q3 Sea Freight Project"
						bind:value={projectName}
					/>
				</label>

				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Customer (optional)</span>
					<select
						name="customerId"
						class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
						bind:value={selectedCustomerId}
					>
						<option value="">— no customer —</option>
						{#each data.customers as customer}
							<option value={customer.id}>{customer.name}</option>
						{/each}
					</select>
				</label>

				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Parent project (sub-project)</span>
					<select
						name="parentProjectId"
						class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
						bind:value={parentProjectId}
					>
						<option value="">— top-level project —</option>
						{#each data.parentProjects as p}
							<option value={p.id}>{p.name}</option>
						{/each}
					</select>
				</label>

				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Status</span>
					<select
						name="status"
						class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
						bind:value={status}
					>
						<option value="unassigned">Unassigned</option>
						<option value="ongoing">Ongoing</option>
						<option value="under_review">Under Review</option>
						<option value="completed">Completed</option>
					</select>
				</label>

				<!-- Priority is no longer user-entered. We compute a green/yellow/red
				urgency colour from the project's deadline at render time (see
				`src/modules/project/services/urgency.ts`). The schema column is
				retained for a possible future manual-override toggle. -->
				<div class="space-y-1 text-sm">
					<span class="text-slate-700">Urgency</span>
					<p class="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
						Auto-calculated from the deadline — fresh projects start green and shift to
						yellow then red as the deadline approaches.
					</p>
				</div>
			</div>
		</section>

		<!-- Schedule -->
		<section class="space-y-4">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Schedule</h3>
			<div class="grid gap-4 md:grid-cols-3">
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Start date</span>
					<input
						type="date"
						name="startDate"
						class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
						bind:value={startDate}
					/>
				</label>

				<label class="space-y-1 text-sm">
					<span class="text-slate-700">End date</span>
					<input
						type="date"
						name="endDate"
						class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
						bind:value={endDate}
					/>
				</label>

				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Deadline <span class="text-rose-600">*</span></span>
					<input
						type="date"
						name="deadline"
						required
						class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
						bind:value={deadline}
					/>
				</label>
			</div>
		</section>

		<!-- Ownership + collaborators -->
		<section class="space-y-4">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">People</h3>
			<div class="grid gap-4 md:grid-cols-2">
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Owner (Project Manager · Reviewer)</span>
					{#if data.canAssignOwner}
						<select
							name="ownerId"
							class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
							bind:value={ownerId}
						>
							<option value="">— assign later —</option>
							{#each data.users as u}
								<option value={u.id}>{u.name} · {u.email}</option>
							{/each}
						</select>
					{:else}
						<input
							type="hidden"
							name="ownerId"
							value={data.currentUser?.id ?? ''}
						/>
						<p class="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
							{data.currentUser?.email ?? 'You'} (only managers/directors can re-assign)
						</p>
					{/if}
				</label>
			</div>

			<div class="space-y-2">
				<p class="text-sm text-slate-700">Collaborators</p>
				<div class="flex flex-wrap gap-2">
					{#each selectedCollaborators as c (c.id)}
						<input type="hidden" name="collaboratorUserIds" value={c.id} />
						<span class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs">
							<span class="font-medium text-slate-800">{c.email}</span>
							<input
								class="w-24 rounded border border-slate-300 px-1.5 py-0.5 text-[11px]"
								placeholder="role"
								bind:value={c.role}
							/>
							<button
								type="button"
								class="text-rose-600 hover:underline"
								onclick={() => removeCollaborator(c.id)}
							>
								×
							</button>
						</span>
					{/each}
				</div>
				<input
					type="hidden"
					name="collaboratorRolesJson"
					value={collaboratorRolesJson}
				/>
				<div class="relative">
					<input
						class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
						placeholder="Search users by email or name…"
						bind:value={collabSearch}
					/>
					{#if filteredUsers.length > 0}
						<ul class="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow">
							{#each filteredUsers as u}
								<li>
									<button
										type="button"
										class="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
										onclick={() => addCollaborator(u)}
									>
										<span class="font-medium text-slate-800">{u.name}</span>
										<span class="ml-2 text-xs text-slate-500">{u.email}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
		</section>

		<!-- Details -->
		<section class="space-y-4">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Details</h3>
			<label class="block space-y-1 text-sm">
				<span class="text-slate-700">Description</span>
				<textarea
					name="description"
					rows="3"
					class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
					placeholder="What is this project about?"
					bind:value={description}
				></textarea>
			</label>
			<label class="block space-y-1 text-sm">
				<span class="text-slate-700">Notes</span>
				<textarea
					name="notes"
					rows="3"
					class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
					placeholder="Internal notes, links, anything useful"
					bind:value={notes}
				></textarea>
			</label>

			<div class="space-y-1.5 text-sm">
				<div class="flex items-baseline justify-between gap-2">
					<span class="text-slate-700">Attachments (optional)</span>
					{#if attachmentFiles.length > 0}
						<span class="text-[11px] text-slate-500">
							{attachmentFiles.length} file{attachmentFiles.length === 1 ? '' : 's'} queued
						</span>
					{/if}
				</div>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					role="button"
					tabindex="0"
					aria-label="Drag and drop files here, or click to choose"
					onclick={() => attachmentInput?.click()}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							attachmentInput?.click();
						}
					}}
					ondragover={onDragOver}
					ondragenter={onDragOver}
					ondragleave={onDragLeave}
					ondrop={onDrop}
					class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition {dragActive
						? 'border-[var(--sf-green)] bg-[var(--sf-green-soft)]'
						: 'border-slate-300 bg-slate-50/40 hover:border-[var(--sf-green)] hover:bg-slate-50'}"
				>
					<span class="text-3xl">📥</span>
					<p class="text-sm font-medium text-slate-700">
						Drag &amp; drop files here, or
						<span class="text-[var(--sf-green)] underline underline-offset-2">click to choose</span>
					</p>
					<p class="text-[11px] text-slate-500">
						{ALLOWED_EXTS.join(', ')} · up to 15 MB each · multiple files supported
					</p>
					<input
						bind:this={attachmentInput}
						type="file"
						name="files"
						accept={ACCEPT_ATTR}
						multiple
						class="hidden"
						onchange={onInputChange}
					/>
				</div>

				{#if attachmentFiles.length > 0}
					<ul class="space-y-1.5 rounded-md border border-slate-200 bg-white p-2">
						{#each attachmentFiles as file (fileKey(file))}
							<li class="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50">
								<span class="text-xl">{fileEmoji(file.name)}</span>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium text-slate-800">{file.name}</p>
									<p class="text-[11px] text-slate-500">
										{formatBytes(file.size)} · {file.type || extOf(file.name).toUpperCase()}
									</p>
								</div>
								<button
									type="button"
									class="rounded-md border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50"
									onclick={() => removeQueued(file)}
								>
									Remove
								</button>
							</li>
						{/each}
					</ul>
				{/if}

				{#if attachmentError}
					<p class="text-[11px] text-rose-600">{attachmentError}</p>
				{/if}
			</div>
		</section>

		<!-- Recurrence -->
		<section class="space-y-4">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Recurrence</h3>
			<p class="text-xs text-slate-500">
				When this project moves to <span class="font-medium">Completed</span>, the system will
				automatically create the next occurrence with the deadline rolled forward.
			</p>
			<div class="grid gap-4 md:grid-cols-2">
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Frequency</span>
					<select
						name="recurrenceFrequency"
						class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
						bind:value={recurrenceFrequency}
					>
						<option value="">No recurrence</option>
						<option value="daily">Daily</option>
						<option value="weekly">Weekly</option>
						<option value="monthly">Monthly</option>
						<option value="custom">Custom (every N days)</option>
					</select>
				</label>

				{#if recurrenceFrequency === 'custom'}
					<label class="space-y-1 text-sm">
						<span class="text-slate-700">Every N days</span>
						<input
							type="number"
							name="recurrenceInterval"
							min="1"
							class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
							bind:value={recurrenceInterval}
						/>
					</label>
				{/if}
			</div>
		</section>

		<div class="flex gap-3 pt-2">
			<button
				class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]"
				type="submit"
			>
				Create Project
			</button>
			<a
				class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
				href="/projects"
			>
				Back to list
			</a>
		</div>
	</form>
</PageShell>
