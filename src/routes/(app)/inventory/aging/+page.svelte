<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	let { data } = $props();

	const totals = $derived(() => {
		const t = (data.report?.buckets ?? []).map((b: { label: string }) => ({ label: b.label, qty: 0, value: 0 }));
		for (const row of data.report?.rows ?? []) {
			(row.buckets as Array<{ quantity: number; value: number }>).forEach((b, i: number) => {
				t[i].qty += b.quantity;
				t[i].value += b.value;
			});
		}
		return t;
	});
</script>

<PageShell
	eyebrow="Inventory"
	title="Aging report"
	description="Current on-hand stock bucketed by receipt date. Layers consumed FIFO from the movement ledger; older buckets flag slow-moving inventory."
>
	<form class="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3" method="GET">
		<label class="space-y-1 text-sm">
			<span class="text-slate-700">Warehouse</span>
			<select name="warehouseId" class="w-full rounded-md border border-slate-300 px-3 py-2">
				<option value="">All warehouses</option>
				{#each data.warehouses as wh}
					<option value={wh.id} selected={data.filters.warehouseId === wh.id}>{wh.code} — {wh.name}</option>
				{/each}
			</select>
		</label>
		<label class="space-y-1 text-sm">
			<span class="text-slate-700">As of (ISO)</span>
			<input name="asOf" value={data.filters.asOf ?? ''} placeholder={data.report?.asOf ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" />
		</label>
		<div class="flex items-end gap-2">
			<button class="rounded-md bg-[var(--sf-green)] px-3 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]">Apply</button>
			<a class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/inventory/aging">Reset</a>
		</div>
	</form>

	<div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
		{#each totals() as col}
			<div class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
				<div class="text-xs uppercase text-slate-500">Bucket {col.label} days</div>
				<div class="mt-1 text-lg font-mono">{col.qty.toFixed(2)}</div>
				<div class="text-xs text-slate-500">SGD {col.value.toFixed(2)}</div>
			</div>
		{/each}
	</div>

	<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-slate-200 text-sm">
			<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
				<tr>
					<th class="px-3 py-3">Item</th>
					<th class="px-3 py-3">Warehouse · Bin</th>
					<th class="px-3 py-3 text-right">On hand</th>
					<th class="px-3 py-3 text-right">Value (SGD)</th>
					<th class="px-3 py-3">Oldest received</th>
					{#each data.report?.buckets ?? [] as b}
						<th class="px-3 py-3 text-right">{b.label}d</th>
					{/each}
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#if (data.report?.rows.length ?? 0) === 0}
					<tr><td colspan="9" class="px-4 py-8 text-center text-slate-500">No stock to age.</td></tr>
				{:else if data.report}
					{#each data.report.rows as row}
						{@const it = data.items[row.itemId]}
						{@const wh = data.warehousesById[row.warehouseId]}
						{@const bin = data.binsById[row.binLocationId]}
						<tr>
							<td class="px-3 py-2 text-xs">
								<div class="font-mono">{it?.code ?? row.itemId}</div>
								<div class="text-slate-500">{it?.name ?? ''}</div>
							</td>
							<td class="px-3 py-2 text-xs font-mono">{wh?.code ?? row.warehouseId} · {bin?.code ?? row.binLocationId}</td>
							<td class="px-3 py-2 text-right font-mono text-xs">{row.totalOnHand.toFixed(2)}</td>
							<td class="px-3 py-2 text-right font-mono text-xs">{row.totalValue.toFixed(2)}</td>
							<td class="px-3 py-2 text-xs text-slate-500">{row.oldestReceivedAt ?? '—'}</td>
							{#each row.buckets as b}
								<td class="px-3 py-2 text-right font-mono text-xs" class:text-rose-700={b.label === '181+' && b.quantity > 0}>
									{b.quantity > 0 ? b.quantity.toFixed(2) : '—'}
								</td>
							{/each}
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</PageShell>
