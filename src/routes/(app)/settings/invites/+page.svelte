<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';

	let { data, form } = $props();

	let copied = $state(false);
	let selectedRoles = $state<string[]>([]);
	let linkedPersonId = $state('');

	function toggleRole(role: string, checked: boolean) {
		selectedRoles = checked
			? [...selectedRoles, role]
			: selectedRoles.filter((r) => r !== role);
		// Clear the person selection when the employee role is removed.
		if (role === 'employee' && !checked) linkedPersonId = '';
	}

	async function copyCode(code: string) {
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {}
	}

	function statusLabel(inv: { isExpired: boolean; isFullyUsed: boolean }) {
		if (inv.isFullyUsed) return { text: 'Used', class: 'text-slate-500 bg-slate-50 border-slate-200' };
		if (inv.isExpired) return { text: 'Expired', class: 'text-amber-600 bg-amber-50 border-amber-200' };
		return { text: 'Active', class: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
	}

	function roleBadgeClass(role: string) {
		const m: Record<string, string> = {
			owner: 'bg-purple-50 text-purple-700 border-purple-200',
			admin: 'bg-indigo-50 text-indigo-700 border-indigo-200',
			finance: 'bg-emerald-50 text-emerald-700 border-emerald-200',
			project_manager: 'bg-blue-50 text-blue-700 border-blue-200',
			hr: 'bg-amber-50 text-amber-700 border-amber-200',
			staff: 'bg-slate-50 text-slate-600 border-slate-200',
			employee: 'bg-gray-50 text-gray-600 border-gray-200'
		};
		return m[role] ?? 'bg-gray-50 text-gray-600 border-gray-200';
	}
</script>

<PageShell
	eyebrow="Settings"
	title="Invite Codes"
	description="Generate invite codes for new team members. Each code has pre-assigned roles and expires after 7 days."
>
	{#if form?.message}
		<p
			class={`mb-4 rounded-md border px-3 py-2 text-sm ${
				form.saved
					? 'border-emerald-200 bg-emerald-50 text-emerald-700'
					: 'border-rose-200 bg-rose-50 text-rose-700'
			}`}
		>
			{form.message}
			{#if form.generatedCode}
				<button
					type="button"
					onclick={() => copyCode(form.generatedCode)}
					class="ml-2 rounded bg-emerald-700 px-2 py-0.5 text-xs text-white hover:bg-emerald-800"
				>
					{copied ? 'Copied!' : 'Copy'}
				</button>
			{/if}
		</p>
	{/if}

	<div class="grid gap-6 lg:grid-cols-3">
		<!-- Generate form -->
		<form method="POST" action="?/generate" class="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-1">
			<h2 class="text-base font-semibold text-slate-800">Generate New Code</h2>

			<div>
				<p class="mb-2 text-xs font-medium text-slate-600">Assign roles</p>
				<div class="space-y-1.5">
					{#each data.allRoles as role}
						<label class="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								name="role"
								value={role}
								onchange={(e) => toggleRole(role, e.currentTarget.checked)}
								class="h-3.5 w-3.5 rounded border-slate-300 text-[var(--sf-green)] focus:ring-[var(--sf-green)]"
							/>
							{role}
						</label>
					{/each}
				</div>
			</div>

			{#if selectedRoles.includes('employee')}
				<label class="block text-sm font-medium text-slate-700">
					Link to employee
					<select
						name="linkedPersonId"
						bind:value={linkedPersonId}
						required
						class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-[var(--sf-green)] focus:ring-2"
					>
						<option value="" disabled>Select an employee…</option>
						{#each data.linkablePersons as p (p.id)}
							<option value={p.id}>{p.name}{p.email ? ` (${p.email})` : ''}</option>
						{/each}
					</select>
					{#if data.linkablePersons.length === 0}
						<span class="mt-1 block text-[11px] text-amber-600">
							No unlinked active employees available. Create an employee in HR first.
						</span>
					{/if}
				</label>
			{/if}

			<label class="block text-sm font-medium text-slate-700">
				Expires in (days)
				<input
					type="number"
					name="expiresInDays"
					value="7"
					min="1"
					max="365"
					class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-[var(--sf-green)] focus:ring-2"
				/>
			</label>

			<label class="block text-sm font-medium text-slate-700">
				Note (optional)
				<input
					type="text"
					name="label"
					placeholder="e.g. For new accountant"
					class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-[var(--sf-green)] focus:ring-2"
				/>
			</label>

			<button
				type="submit"
				class="w-full rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]"
			>
				Generate Invite Code
			</button>
		</form>

		<!-- Code list -->
		<div class="rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
			<div class="border-b border-slate-200 px-6 py-4">
				<h2 class="text-base font-semibold text-slate-800">All Invite Codes</h2>
			</div>

			{#if data.invites.length === 0}
				<p class="px-6 py-8 text-center text-sm text-slate-400">No invite codes yet.</p>
			{:else}
				<div class="divide-y divide-slate-100">
					{#each data.invites as inv (inv.id)}
						{@const status = statusLabel(inv)}
						<div class="px-6 py-4">
							<div class="flex items-start justify-between gap-4">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<code class="rounded bg-slate-100 px-2 py-0.5 text-sm font-medium tracking-wider text-slate-800">{inv.code}</code>
										<span class={`rounded border px-1.5 py-0.5 text-[10px] uppercase font-medium ${status.class}`}>{status.text}</span>
										<button
											type="button"
											onclick={() => copyCode(inv.code)}
											class="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-50"
										>Copy</button>
									</div>
									<div class="mt-1.5 flex flex-wrap gap-1">
										{#each inv.roles as role}
											<span class={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${roleBadgeClass(role)}`}>{role}</span>
										{/each}
									</div>
									<div class="mt-1.5 flex gap-3 text-[11px] text-slate-400">
										{#if inv.label}
											<span>{inv.label}</span>
										{/if}
										<span>Expires: {new Date(inv.expiresAt).toLocaleDateString()}</span>
										<span>Uses: {inv.useCount}/{inv.maxUses}</span>
									</div>
								</div>
								{#if !inv.isExpired && !inv.isFullyUsed}
									<form method="POST" action="?/revoke">
										<input type="hidden" name="codeId" value={inv.id} />
										<button
											type="submit"
											class="rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
										>Revoke</button>
									</form>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</PageShell>
