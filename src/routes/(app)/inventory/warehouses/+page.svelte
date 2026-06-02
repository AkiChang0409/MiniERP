<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { enhance } from '$app/forms';

	let { data } = $props();
	let pendingDeleteId = $state<string | null>(null);
</script>

<PageShell
	eyebrow="Inventory"
	title="Warehouses"
	description="Physical or logical warehouse master data. Each warehouse owns one or more bin locations; stock is tracked per (item, warehouse, bin)."
>
	<div class="mb-4 flex flex-wrap items-center gap-3">
		<a class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" href="/inventory/warehouses/new">
			New warehouse
		</a>
		<a class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/inventory/stock">
			Stock by location
		</a>
		<a class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/inventory/transfers">
			Stock transfers
		</a>
	</div>

	<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-slate-200 text-sm">
			<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
				<tr>
					<th class="px-4 py-3">Code</th>
					<th class="px-4 py-3">Name</th>
					<th class="px-4 py-3">Status</th>
					<th class="px-4 py-3">Address</th>
					<th class="px-4 py-3">Contact</th>
					<th class="px-4 py-3 text-right">Bins w/ stock</th>
					<th class="px-4 py-3 text-right">Total on hand</th>
					<th class="px-4 py-3"></th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#if data.warehouses.length === 0}
					<tr>
						<td colspan="8" class="px-4 py-8 text-center text-slate-500">
							No warehouses yet.
							<a href="/inventory/warehouses/new" class="font-medium text-[var(--sf-green)] hover:underline">Add one</a>.
						</td>
					</tr>
				{:else}
					{#each data.warehouses as wh}
						{#if pendingDeleteId === wh.id}
							<tr class="bg-red-50">
								<td colspan="7" class="px-4 py-3 text-sm font-medium text-red-700">
									Delete warehouse <strong>{wh.code} — {wh.name}</strong>? Bins and stock history are preserved (soft delete).
								</td>
								<td class="px-4 py-3 text-right">
									<form
										class="inline-flex items-center gap-2"
										method="POST"
										action="?/delete"
										use:enhance={() => ({ update }) => update({ reset: false })}
									>
										<input type="hidden" name="id" value={wh.id} />
										<button class="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">Confirm</button>
										<button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-xs" onclick={() => (pendingDeleteId = null)}>
											Cancel
										</button>
									</form>
								</td>
							</tr>
						{:else}
							<tr class="hover:bg-slate-50/80">
								<td class="px-4 py-3 font-mono text-xs">
									<a class="hover:text-[var(--sf-green)] hover:underline" href={`/inventory/warehouses/${wh.id}`}>{wh.code}</a>
								</td>
								<td class="px-4 py-3 font-medium text-slate-900">{wh.name}</td>
								<td class="px-4 py-3 text-slate-600 capitalize">{wh.status}</td>
								<td class="px-4 py-3 text-slate-600 text-xs">
									{#if wh.addressLine1}
										<div>{wh.addressLine1}</div>
									{/if}
									<div class="text-slate-500">
										{[wh.city, wh.postalCode, wh.country].filter(Boolean).join(' · ') || '—'}
									</div>
								</td>
								<td class="px-4 py-3 text-slate-600 text-xs">
									{#if wh.contactName}<div>{wh.contactName}</div>{/if}
									{#if wh.contactPhone}<div class="text-slate-500">{wh.contactPhone}</div>{/if}
									{#if wh.contactEmail}<div class="text-slate-500">{wh.contactEmail}</div>{/if}
								</td>
								<td class="px-4 py-3 text-right">
									{data.stockSummaryByWarehouse[wh.id]?.binsWithStock ?? 0}
								</td>
								<td class="px-4 py-3 text-right font-mono">
									{(data.stockSummaryByWarehouse[wh.id]?.onHand ?? 0).toFixed(2)}
								</td>
								<td class="px-4 py-3 text-right">
									<a href={`/inventory/warehouses/${wh.id}`} class="mr-2 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">
										Open
									</a>
									<button type="button" class="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50" onclick={() => (pendingDeleteId = wh.id)}>
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
