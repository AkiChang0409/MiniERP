<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	let { data } = $props();

	function fmt(id: string | null | undefined) {
		if (!id) return '—';
		const wh = data.warehousesById[id];
		return wh ? `${wh.code} — ${wh.name}` : id;
	}
</script>

<PageShell eyebrow="Inventory" title="Stock transfers" description="Move stock between warehouses or bins. Draft → in-transit → completed.">
	<div class="mb-4 flex gap-3">
		<a class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" href="/inventory/transfers/new">
			New transfer
		</a>
		<a class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/inventory/stock">Stock by location</a>
	</div>

	<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-slate-200 text-sm">
			<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
				<tr>
					<th class="px-4 py-3">Transfer #</th>
					<th class="px-4 py-3">Status</th>
					<th class="px-4 py-3">From</th>
					<th class="px-4 py-3">To</th>
					<th class="px-4 py-3">Requested</th>
					<th class="px-4 py-3">Shipped</th>
					<th class="px-4 py-3">Received</th>
					<th class="px-4 py-3"></th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#if data.transfers.length === 0}
					<tr><td colspan="8" class="px-4 py-8 text-center text-slate-500">No transfers yet.</td></tr>
				{:else}
					{#each data.transfers as t}
						<tr>
							<td class="px-4 py-3 font-mono text-xs">
								<a href={`/inventory/transfers/${t.id}`} class="hover:text-[var(--sf-green)] hover:underline">{t.transferNumber}</a>
							</td>
							<td class="px-4 py-3 text-xs capitalize">
								<span class="rounded-full bg-slate-100 px-2 py-1">{t.status.replace('_', ' ')}</span>
							</td>
							<td class="px-4 py-3">{fmt(t.sourceWarehouseId)}</td>
							<td class="px-4 py-3">{fmt(t.destWarehouseId)}</td>
							<td class="px-4 py-3 text-xs text-slate-500">{t.requestedAt ?? '—'}</td>
							<td class="px-4 py-3 text-xs text-slate-500">{t.shippedAt ?? '—'}</td>
							<td class="px-4 py-3 text-xs text-slate-500">{t.receivedAt ?? '—'}</td>
							<td class="px-4 py-3 text-right">
								<a class="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" href={`/inventory/transfers/${t.id}`}>Open</a>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</PageShell>
