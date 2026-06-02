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
	let priority = $state(5);
	let ownerId = $state(data.currentUser?.id ?? '');
	let parentProjectId = $state('');
	let attachmentUrl = $state('');
	let attachmentName = $state('');
	let recurrenceFrequency = $state('');
	let recurrenceInterval = $state<number | ''>('');
	let collabSearch = $state('');
	let selectedCollaborators = $state<Array<{ id: string; email: string; name: string; role: string }>>([]);

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
	<form class="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm" method="POST">
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

				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Priority (1–10)</span>
					<input
						type="number"
						name="priority"
						min="1"
						max="10"
						class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
						bind:value={priority}
					/>
				</label>
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
					<span class="text-slate-700">Owner</span>
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

			<div class="grid gap-4 md:grid-cols-2">
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Attachment URL (PDF)</span>
					<input
						type="url"
						name="attachmentUrl"
						class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
						placeholder="https://… (paste a link to the PDF)"
						bind:value={attachmentUrl}
					/>
				</label>
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Attachment label</span>
					<input
						name="attachmentName"
						class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
						placeholder="e.g. brief.pdf"
						bind:value={attachmentName}
					/>
				</label>
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
