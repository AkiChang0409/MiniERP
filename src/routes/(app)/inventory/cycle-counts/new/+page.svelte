<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	let { data, form } = $props();
	const formAny = $derived(form as { message?: string } | null | undefined);

	let warehouseId = $state('');
	const bins = $derived(warehouseId ? data.binsByWarehouse[warehouseId] ?? [] : []);
</script>

<PageShell
	eyebrow="Inventory"
	title="New cycle count"
	description="Schedule a cycle count session. Expected on-hand is snapshot from current stock levels; the clerk then records counted quantity per line."
>
	<form method="POST" enctype="multipart/form-data" class="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
		{#if formAny?.message}
			<p class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{formAny.message}</p>
		{/if}

		<div class="grid gap-4 md:grid-cols-2">
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Warehouse<span class="text-rose-600"> *</span></span>
				<select name="warehouseId" required bind:value={warehouseId} class="w-full rounded-md border border-slate-300 px-3 py-2">
					<option value="">Pick…</option>
					{#each data.warehouses as wh}
						<option value={wh.id}>{wh.code} — {wh.name}</option>
					{/each}
				</select>
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Count type</span>
				<select name="countType" class="w-full rounded-md border border-slate-300 px-3 py-2">
					<option value="cycle_count">Cycle count (subset)</option>
					<option value="full_physical">Full physical inventory</option>
				</select>
			</label>
			<div class="space-y-1 text-sm md:col-span-2">
				<span class="text-slate-700">
					Signed physical count document
					<span class="text-xs text-slate-500">(required for variances &gt; SGD 10k to suppress IA002 — you can also attach this later)</span>
				</span>
				<div class="grid gap-2 md:grid-cols-[1fr_auto_1fr]">
					<input type="file" name="file" accept=".pdf,image/*" class="rounded-md border border-slate-300 px-3 py-2 text-sm" />
					<span class="self-center text-[10px] uppercase text-slate-500">or</span>
					<input name="documentRef" class="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Manual reference (file id / URL)" />
				</div>
			</div>
			<label class="space-y-1 text-sm md:col-span-2">
				<span class="text-slate-700">Notes</span>
				<textarea name="notes" rows="2" class="w-full rounded-md border border-slate-300 px-3 py-2"></textarea>
			</label>
		</div>

		<section class="space-y-2">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Bin scope (optional)</h2>
			<p class="text-xs text-slate-500">Leave all unchecked to count every bin with stock in this warehouse.</p>
			<div class="grid gap-2 md:grid-cols-3">
				{#each bins as bin}
					<label class="flex items-center gap-2 text-xs">
						<input type="checkbox" name="binIds" value={bin.id} class="rounded border-slate-300" />
						<span class="font-mono">{bin.code}</span>
						<span class="text-slate-500 capitalize">({bin.locationType.replace('_', ' ')})</span>
					</label>
				{/each}
			</div>
		</section>

		<div class="flex justify-end gap-3">
			<a href="/inventory/cycle-counts" class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancel</a>
			<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]">Start counting</button>
		</div>
	</form>
</PageShell>
