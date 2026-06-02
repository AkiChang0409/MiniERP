<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { enhance } from '$app/forms';

	let { data } = $props();

	let pendingDeleteId = $state<string | null>(null);
</script>

<PageShell
	eyebrow="Sales & CRM"
	title="Customers"
	description="Customer master data for projects, quotations, and customer-facing AR documents."
>
	<div class="mb-4 flex flex-wrap items-center gap-3">
		<a
			class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]"
			href="/sales-crm/customers/new"
		>
			New customer
		</a>
		<a class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/projects/new">
			Create project
		</a>
	</div>

	<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-slate-200 text-sm">
			<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
				<tr>
					<th class="px-4 py-3">Name</th>
					<th class="px-4 py-3">Contact</th>
					<th class="px-4 py-3">Address</th>
					<th class="px-4 py-3"></th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#if data.customers.length === 0}
					<tr>
						<td colspan="4" class="px-4 py-8 text-center text-slate-500">
							No customers yet.
							<a class="font-medium text-[var(--sf-green)] hover:underline" href="/sales-crm/customers/new">Add your first customer</a>
							then create a project.
						</td>
					</tr>
				{:else}
					{#each data.customers as c}
						{#if pendingDeleteId === c.id}
							<tr class="bg-red-50">
								<td colspan="3" class="px-4 py-3 text-sm font-medium text-red-700">
									Delete <span class="font-semibold">{c.name}</span>? This cannot be undone.
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
											<input type="hidden" name="id" value={c.id} />
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
								<td class="px-4 py-3 font-medium text-slate-900">{c.name}</td>
								<td class="px-4 py-3 text-slate-600">{c.contact ?? '-'}</td>
								<td class="max-w-md truncate px-4 py-3 text-slate-600" title={c.address ?? ''}>{c.address ?? '-'}</td>
								<td class="px-4 py-3 text-right">
									<button
										type="button"
										class="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
										onclick={() => (pendingDeleteId = c.id)}
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
