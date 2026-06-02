<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';

	let { data, form } = $props();
	const formAny = $derived(form as {
		message?: string;
		adjustedQty?: number;
		valueDelta?: number | null;
		iaAlertCode?: string | null;
	} | null | undefined);
</script>

<PageShell
	eyebrow="Inventory"
	title="Stock by location"
	description="Quantity on hand per (item × warehouse × bin). Use the adjustment form to record receipts, issues, or counts."
>
	<div class="mb-4 flex flex-wrap items-center gap-3">
		<a class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/inventory/warehouses">Warehouses</a>
		<a class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/inventory/transfers">Transfers</a>
	</div>

	<form class="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4" method="GET">
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
			<span class="text-slate-700">Bin</span>
			<select name="binId" class="w-full rounded-md border border-slate-300 px-3 py-2" disabled={!data.filters.warehouseId}>
				<option value="">{data.filters.warehouseId ? 'Any bin' : 'Pick warehouse first'}</option>
				{#each data.bins as bin}
					<option value={bin.id} selected={data.filters.binId === bin.id}>{bin.code} ({bin.locationType.replace('_', ' ')})</option>
				{/each}
			</select>
		</label>
		<div class="flex items-end gap-2">
			<button class="rounded-md bg-[var(--sf-green)] px-3 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]">Apply</button>
			<a class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/inventory/stock">Reset</a>
		</div>
	</form>

	<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-slate-200 text-sm">
			<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
				<tr>
					<th class="px-4 py-3">Item</th>
					<th class="px-4 py-3">Warehouse</th>
					<th class="px-4 py-3">Bin</th>
					<th class="px-4 py-3">Type</th>
					<th class="px-4 py-3 text-right">On hand</th>
					<th class="px-4 py-3 text-right">Reserved</th>
					<th class="px-4 py-3 text-right">Incoming</th>
					<th class="px-4 py-3 text-right">Unit cost</th>
					<th class="px-4 py-3">Last movement</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#if data.stockLevels.length === 0}
					<tr><td colspan="9" class="px-4 py-8 text-center text-slate-500">No stock yet matching this filter.</td></tr>
				{:else}
					{#each data.stockLevels as row}
						<tr>
							<td class="px-4 py-3">
								<div class="font-mono text-xs">{row.item.code}</div>
								<div class="text-slate-600 text-xs">{row.item.name}</div>
							</td>
							<td class="px-4 py-3 font-mono text-xs">{row.warehouse.code}</td>
							<td class="px-4 py-3 font-mono text-xs">{row.bin.code}</td>
							<td class="px-4 py-3 capitalize text-slate-600 text-xs">{row.bin.locationType.replace('_', ' ')}</td>
							<td class="px-4 py-3 text-right font-mono">{Number(row.level.quantityOnHand).toFixed(2)}</td>
							<td class="px-4 py-3 text-right font-mono">{Number(row.level.quantityReserved).toFixed(2)}</td>
							<td class="px-4 py-3 text-right font-mono">{Number(row.level.quantityIncoming).toFixed(2)}</td>
							<td class="px-4 py-3 text-right font-mono">{row.level.unitCost != null ? Number(row.level.unitCost).toFixed(4) : '—'}</td>
							<td class="px-4 py-3 text-xs text-slate-500">{row.level.lastMovementAt ?? '—'}</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>

	<!-- Stock adjustment form -->
	<form method="POST" action="?/adjust" class="mt-8 space-y-3 rounded-xl border border-amber-200 bg-amber-50/30 p-4">
		<h2 class="text-sm font-semibold text-amber-800">Stock adjustment (receipt / issue / count)</h2>
		{#if formAny?.message}
			<p class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{formAny.message}</p>
		{/if}
		{#if formAny?.adjustedQty !== undefined}
			<p class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
				Saved · on-hand now {formAny.adjustedQty.toFixed(2)}{#if formAny.valueDelta !== null && formAny.valueDelta !== undefined} · value delta SGD {formAny.valueDelta.toFixed(2)}{/if}
			</p>
		{/if}
		{#if formAny?.iaAlertCode === 'IA002'}
			<p class="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">
				⚠ IA002 alert: adjustment value exceeds the SGD 10,000 threshold without a signed physical count document. The movement has been recorded and flagged in the audit trail; please attach a count document and re-record.
			</p>
		{/if}
		<div class="grid gap-3 md:grid-cols-4">
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Item</span>
				<select name="itemId" required class="w-full rounded-md border border-slate-300 px-3 py-2">
					<option value="">Pick…</option>
					{#each data.items as item}
						<option value={item.id}>{item.code} — {item.name}</option>
					{/each}
				</select>
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Warehouse</span>
				<select name="warehouseId" required class="w-full rounded-md border border-slate-300 px-3 py-2">
					<option value="">Pick…</option>
					{#each data.warehouses as wh}
						<option value={wh.id}>{wh.code} — {wh.name}</option>
					{/each}
				</select>
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Bin ID</span>
				<input
					name="binLocationId"
					required
					class="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
					placeholder="Paste bin id from /inventory/warehouses/[id]"
				/>
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Movement type</span>
				<select name="movementType" class="w-full rounded-md border border-slate-300 px-3 py-2">
					<option value="">auto (receipt / issue by sign)</option>
					<option value="opening_balance">Opening balance</option>
					<option value="receipt">Receipt</option>
					<option value="issue">Issue</option>
					<option value="adjustment">Adjustment</option>
					<option value="scrap">Scrap</option>
					<option value="cycle_count">Cycle count variance</option>
				</select>
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Reason code</span>
				<input name="reasonCode" class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="damage / expiry / supplier_return / found / lost" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Quantity delta (+/−)</span>
				<input name="quantityDelta" required type="number" step="any" class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="e.g. 10 or -2" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Unit cost (optional)</span>
				<input name="unitCost" type="number" step="0.0001" class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm md:col-span-2">
				<span class="text-slate-700">
					Physical count document reference
					<span class="text-xs text-slate-500">(required for adjustments &gt; SGD 10,000 to suppress IA002)</span>
				</span>
				<input name="physicalCountDocumentRef" class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="e.g. CC-20260601-0001 or signed PDF reference" />
			</label>
			<label class="space-y-1 text-sm md:col-span-2">
				<span class="text-slate-700">Notes</span>
				<input name="notes" class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
		</div>
		<div class="text-right">
			<button class="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">Apply adjustment</button>
		</div>
	</form>
</PageShell>
