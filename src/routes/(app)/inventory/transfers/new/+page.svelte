<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';

	let { data, form } = $props();
	const formAny = $derived(form as { message?: string } | null | undefined);

	let sourceWarehouseId = $state('');
	let destWarehouseId = $state('');
	let lines = $state<Array<{
		_uid: string;
		itemId: string;
		sourceBinId: string;
		destBinId: string;
		quantity: string;
		notes: string;
	}>>([
		{ _uid: crypto.randomUUID(), itemId: '', sourceBinId: '', destBinId: '', quantity: '', notes: '' }
	]);

	function addLine() {
		lines = [...lines, { _uid: crypto.randomUUID(), itemId: '', sourceBinId: '', destBinId: '', quantity: '', notes: '' }];
	}
	function removeLine(uid: string) {
		lines = lines.filter((l) => l._uid !== uid);
	}

	const sourceBins = $derived(sourceWarehouseId ? data.binsByWarehouse[sourceWarehouseId] ?? [] : []);
	const destBins = $derived(destWarehouseId ? data.binsByWarehouse[destWarehouseId] ?? [] : []);
</script>

<PageShell eyebrow="Inventory" title="New stock transfer" description="Pick source / destination warehouses, add one or more line items, then save as draft.">
	<form method="POST" class="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
		{#if formAny?.message}
			<p class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{formAny.message}</p>
		{/if}

		<section class="grid gap-4 md:grid-cols-2">
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Source warehouse<span class="text-rose-600"> *</span></span>
				<select name="sourceWarehouseId" required bind:value={sourceWarehouseId} class="w-full rounded-md border border-slate-300 px-3 py-2">
					<option value="">Pick…</option>
					{#each data.warehouses as wh}
						<option value={wh.id}>{wh.code} — {wh.name}</option>
					{/each}
				</select>
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Destination warehouse<span class="text-rose-600"> *</span></span>
				<select name="destWarehouseId" required bind:value={destWarehouseId} class="w-full rounded-md border border-slate-300 px-3 py-2">
					<option value="">Pick…</option>
					{#each data.warehouses as wh}
						<option value={wh.id}>{wh.code} — {wh.name}</option>
					{/each}
				</select>
			</label>
		</section>

		<section class="space-y-3">
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Lines</h2>
				<button type="button" onclick={addLine} class="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50">+ Add line</button>
			</div>

			{#each lines as line (line._uid)}
				<div class="grid gap-3 rounded-md border border-slate-200 bg-slate-50/40 p-3 md:grid-cols-[1.5fr_1fr_1fr_120px_1fr_auto]">
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Item</span>
						<select name="line_itemId" bind:value={line.itemId} class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
							<option value="">Pick…</option>
							{#each data.items as item}
								<option value={item.id}>{item.code} — {item.name}</option>
							{/each}
						</select>
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Source bin</span>
						<select name="line_sourceBinId" bind:value={line.sourceBinId} class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!sourceWarehouseId}>
							<option value="">{sourceWarehouseId ? 'Pick…' : 'Pick source wh first'}</option>
							{#each sourceBins as bin}
								<option value={bin.id}>{bin.code} ({bin.locationType.replace('_', ' ')})</option>
							{/each}
						</select>
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Dest bin</span>
						<select name="line_destBinId" bind:value={line.destBinId} class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!destWarehouseId}>
							<option value="">{destWarehouseId ? 'Pick…' : 'Pick dest wh first'}</option>
							{#each destBins as bin}
								<option value={bin.id}>{bin.code} ({bin.locationType.replace('_', ' ')})</option>
							{/each}
						</select>
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Quantity</span>
						<input name="line_quantity" type="number" step="any" bind:value={line.quantity} class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Notes</span>
						<input name="line_notes" bind:value={line.notes} class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
					</label>
					<button type="button" onclick={() => removeLine(line._uid)} class="self-end text-xs text-rose-500 hover:underline">Remove</button>
				</div>
			{/each}
		</section>

		<label class="block text-sm">
			<span class="text-slate-700">Notes</span>
			<textarea name="notes" rows="2" class="w-full rounded-md border border-slate-300 px-3 py-2"></textarea>
		</label>

		<div class="flex justify-end gap-3">
			<a href="/inventory/transfers" class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancel</a>
			<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]">Create transfer</button>
		</div>
	</form>
</PageShell>
