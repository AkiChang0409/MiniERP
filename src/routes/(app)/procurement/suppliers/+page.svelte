<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { enhance } from '$app/forms';

	let { data } = $props();

	let pendingDeleteId = $state<string | null>(null);
</script>

<PageShell
	eyebrow="Procurement"
	title="Suppliers"
	description="Vendor and supplier master data used on purchase orders, supplier invoices, and AP-related documents."
>
	<div class="mb-4 flex flex-wrap items-center gap-3">
		<a
			class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]"
			href="/procurement/suppliers/new"
		>
			New supplier
		</a>
		<a
			class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
			href="/procurement/rfqs"
		>
			RFQs & comparison
		</a>
		<a
			class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
			href="/finance/expenses"
		>
			Supplier invoice expenses
		</a>
	</div>

	<form class="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4" method="GET">
		<label class="space-y-1 text-sm md:col-span-2">
			<span class="text-slate-700">Search</span>
			<input
				name="q"
				value={data.filters.q}
				class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
				placeholder="Name, UEN, tax code, payment terms, contact..."
			/>
		</label>
		<label class="space-y-1 text-sm">
			<span class="text-slate-700">Project Related</span>
			<select
				name="project"
				class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
			>
				<option value="">All projects</option>
				{#each data.projectOptions as p}
					<option value={p} selected={data.filters.project === p.toLowerCase()}>{p}</option>
				{/each}
			</select>
		</label>
		<label class="space-y-1 text-sm">
			<span class="text-slate-700">Status</span>
			<select
				name="status"
				class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
			>
				<option value="">All statuses</option>
				<option value="approved" selected={data.filters.status === 'approved'}>Approved</option>
				<option value="preferred" selected={data.filters.status === 'preferred'}>Preferred</option>
				<option value="on_hold" selected={data.filters.status === 'on_hold'}>On Hold</option>
				<option value="blacklisted" selected={data.filters.status === 'blacklisted'}>Blacklisted</option>
			</select>
		</label>
		<div class="md:col-span-4 flex gap-2">
			<button class="rounded-md bg-[var(--sf-green)] px-3 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" type="submit">
				Apply filters
			</button>
			<a class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/procurement/suppliers">
				Reset
			</a>
		</div>
	</form>

	<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-slate-200 text-sm">
			<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
				<tr>
					<th class="px-4 py-3">Name</th>
					<th class="px-4 py-3">Status</th>
					<th class="px-4 py-3">Type</th>
					<th class="px-4 py-3">UEN / BRN</th>
					<th class="px-4 py-3">GST / Tax</th>
					<th class="px-4 py-3">Main Contact</th>
					<th class="px-4 py-3">Terms</th>
					<th class="px-4 py-3">Project Related</th>
					<th class="px-4 py-3">Contacts</th>
					<th class="px-4 py-3"></th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#if data.suppliers.length === 0}
					<tr>
						<td colspan="10" class="px-4 py-8 text-center text-slate-500">
							No suppliers yet.
							<a class="font-medium text-[var(--sf-green)] hover:underline" href="/procurement/suppliers/new">Add your first supplier</a>
							or open
							<a class="font-medium text-[var(--sf-green)] hover:underline" href="/finance/expenses">supplier invoice expenses</a>.
						</td>
					</tr>
				{:else}
					{#each data.suppliers as s}
						{#if pendingDeleteId === s.id}
							<tr class="bg-red-50">
								<td colspan="9" class="px-4 py-3 text-sm font-medium text-red-700">
									Delete <span class="font-semibold">{s.name}</span>? This cannot be undone.
								</td>
								<td class="px-4 py-3">
									<div class="flex items-center gap-2 justify-end">
										<form
											method="POST"
											action="?/delete"
											use:enhance={() => {
												return ({ update }) => update({ reset: false });
											}}
										>
											<input type="hidden" name="id" value={s.id} />
											<button
												type="submit"
												class="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
											>
												Confirm delete
											</button>
										</form>
										<button
											type="button"
											class="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
											onclick={() => (pendingDeleteId = null)}
										>
											Cancel
										</button>
									</div>
								</td>
							</tr>
						{:else}
							<tr class="hover:bg-slate-50/80">
								<td class="px-4 py-3 font-medium text-slate-900">
									<a class="hover:text-[var(--sf-green)] hover:underline" href={`/procurement/suppliers/${s.id}`}>{s.name}</a>
								</td>
								<td class="px-4 py-3 text-slate-600">
									<span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium capitalize text-slate-700">
										{(s.profile?.supplierStatus ?? 'approved').replace('_', ' ')}
									</span>
								</td>
								<td class="px-4 py-3 text-slate-600">{(s.profile?.supplierType ?? '-').replace('_', ' ')}</td>
								<td class="px-4 py-3 text-slate-600">
									<div>{s.profile?.acraUen ?? '-'}</div>
									{#if s.profile?.businessRegistrationNo}
										<div class="text-xs text-slate-500">{s.profile.businessRegistrationNo}</div>
									{/if}
								</td>
								<td class="px-4 py-3 text-slate-600">
									<div class="capitalize">{(s.profile?.gstRegistrationStatus ?? 'unknown').replace('_', ' ')}</div>
									<div class="text-xs text-slate-500">{s.profile?.taxCode ?? '-'}</div>
								</td>
								<td class="px-4 py-3 text-slate-600">{s.contact ?? '-'}</td>
								<td class="px-4 py-3 text-slate-600">
									<div>{s.profile?.paymentTerms ?? '-'}</div>
									{#if s.profile?.creditTerms}
										<div class="text-xs text-slate-500">{s.profile.creditTerms}</div>
									{/if}
								</td>
								<td class="px-4 py-3 text-slate-600">{s.projectRelated ?? '-'}</td>
								<td class="px-4 py-3 text-slate-600">
									{#if s.contacts.length === 0}
										–
									{:else}
										{#each s.contacts as c, i}
											<div class="text-xs">
												<span class="font-medium text-slate-800">{c.name}</span>
												{#if c.position}<span class="text-slate-500"> ({c.position})</span>{/if}
												{#if c.phoneEmail}<span class="text-slate-500"> · {c.phoneEmail}</span>{/if}
												{#if c.wechat}<span class="text-slate-500"> · WeChat: {c.wechat}</span>{/if}
											</div>
											{#if i < s.contacts.length - 1}
												<div class="my-1 h-px w-full bg-slate-100"></div>
											{/if}
										{/each}
									{/if}
								</td>
								<td class="px-4 py-3 text-right">
									<button
										type="button"
										class="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
										onclick={() => (pendingDeleteId = s.id)}
									>
										Delete
									</button>
								</td>
							</tr>
						{/if}
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</PageShell>
