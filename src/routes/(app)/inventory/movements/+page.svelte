<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	let { data } = $props();

	function fmtDelta(n: number) {
		const v = Number(n);
		return (v >= 0 ? '+' : '') + v.toFixed(2);
	}
</script>

<PageShell
	eyebrow="Inventory"
	title="Movements (audit trail)"
	description="Append-only ledger of every inventory transaction (receipt, issue, transfer in/out, adjustment, scrap, cycle count). Each row carries timestamp, user, optional reference, and IA002 alert flag."
>
	<form class="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-5" method="GET">
		<label class="space-y-1 text-sm">
			<span class="text-slate-700">Item</span>
			<select name="itemId" class="w-full rounded-md border border-slate-300 px-3 py-2">
				<option value="">Any item</option>
				{#each data.items as item}
					<option value={item.id} selected={data.filters.itemId === item.id}>{item.code} — {item.name}</option>
				{/each}
			</select>
		</label>
		<label class="space-y-1 text-sm">
			<span class="text-slate-700">Warehouse</span>
			<select name="warehouseId" class="w-full rounded-md border border-slate-300 px-3 py-2">
				<option value="">Any warehouse</option>
				{#each data.warehouses as wh}
					<option value={wh.id} selected={data.filters.warehouseId === wh.id}>{wh.code} — {wh.name}</option>
				{/each}
			</select>
		</label>
		<label class="space-y-1 text-sm">
			<span class="text-slate-700">Type</span>
			<select name="movementType" class="w-full rounded-md border border-slate-300 px-3 py-2">
				<option value="">Any</option>
				<option value="opening_balance" selected={data.filters.movementType === 'opening_balance'}>Opening balance</option>
				<option value="receipt" selected={data.filters.movementType === 'receipt'}>Receipt</option>
				<option value="issue" selected={data.filters.movementType === 'issue'}>Issue</option>
				<option value="transfer_in" selected={data.filters.movementType === 'transfer_in'}>Transfer in</option>
				<option value="transfer_out" selected={data.filters.movementType === 'transfer_out'}>Transfer out</option>
				<option value="adjustment" selected={data.filters.movementType === 'adjustment'}>Adjustment</option>
				<option value="scrap" selected={data.filters.movementType === 'scrap'}>Scrap</option>
				<option value="cycle_count" selected={data.filters.movementType === 'cycle_count'}>Cycle count</option>
			</select>
		</label>
		<label class="space-y-1 text-sm">
			<span class="text-slate-700">Alert</span>
			<select name="alertCode" class="w-full rounded-md border border-slate-300 px-3 py-2">
				<option value="">Any</option>
				<option value="IA002" selected={data.filters.alertCode === 'IA002'}>IA002 only</option>
			</select>
		</label>
		<div class="flex items-end gap-2">
			<button class="rounded-md bg-[var(--sf-green)] px-3 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]">Apply</button>
			<a class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/inventory/movements">Reset</a>
		</div>
	</form>

	<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-slate-200 text-sm">
			<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
				<tr>
					<th class="px-3 py-3">When</th>
					<th class="px-3 py-3">Type</th>
					<th class="px-3 py-3">Item</th>
					<th class="px-3 py-3">Warehouse · Bin</th>
					<th class="px-3 py-3 text-right">Δ qty</th>
					<th class="px-3 py-3 text-right">After</th>
					<th class="px-3 py-3 text-right">Unit cost</th>
					<th class="px-3 py-3 text-right">Δ value</th>
					<th class="px-3 py-3">Reason / reference</th>
					<th class="px-3 py-3">User</th>
					<th class="px-3 py-3">Alert</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#if data.movements.length === 0}
					<tr><td colspan="11" class="px-4 py-8 text-center text-slate-500">No movements yet.</td></tr>
				{:else}
					{#each data.movements as row}
						<tr class={row.movement.iaAlertCode === 'IA002' ? 'bg-rose-50/40' : ''}>
							<td class="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{row.movement.createdAt}</td>
							<td class="px-3 py-2 text-xs capitalize">{row.movement.movementType.replace('_', ' ')}</td>
							<td class="px-3 py-2 text-xs">
								<div class="font-mono">{row.item.code}</div>
								<div class="text-slate-500">{row.item.name}</div>
							</td>
							<td class="px-3 py-2 text-xs font-mono">{row.warehouse.code} · {row.bin.code}</td>
							<td class="px-3 py-2 text-right font-mono text-xs" class:text-emerald-700={Number(row.movement.quantityDelta) > 0} class:text-rose-700={Number(row.movement.quantityDelta) < 0}>
								{fmtDelta(row.movement.quantityDelta)}
							</td>
							<td class="px-3 py-2 text-right font-mono text-xs">{Number(row.movement.quantityAfter).toFixed(2)}</td>
							<td class="px-3 py-2 text-right font-mono text-xs">{row.movement.unitCost != null ? Number(row.movement.unitCost).toFixed(4) : '—'}</td>
							<td class="px-3 py-2 text-right font-mono text-xs">{row.movement.valueDelta != null ? Number(row.movement.valueDelta).toFixed(2) : '—'}</td>
							<td class="px-3 py-2 text-xs text-slate-600">
								{#if row.movement.reasonCode}<div class="text-slate-700">{row.movement.reasonCode}</div>{/if}
								{#if row.movement.referenceType}<div class="text-slate-500">{row.movement.referenceType}{row.movement.referenceId ? ': ' + row.movement.referenceId.slice(0, 8) : ''}</div>{/if}
								{#if row.movement.physicalCountDocumentRef}<div class="text-xs text-emerald-700">📄 {row.movement.physicalCountDocumentRef}</div>{/if}
							</td>
							<td class="px-3 py-2 text-xs text-slate-600">{row.movement.performedByEmail ?? '—'}</td>
							<td class="px-3 py-2 text-xs">
								{#if row.movement.iaAlertCode === 'IA002'}
									<span class="rounded-full bg-rose-100 px-2 py-1 font-medium text-rose-800">IA002</span>
								{:else}
									—
								{/if}
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</PageShell>
