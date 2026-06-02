<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';

	let { data } = $props();

	let pendingDeleteId = $state<string | null>(null);
	let scanValue = $state('');
	let scanError = $state<string | null>(null);
	let scanBusy = $state(false);

	async function onScan(event: SubmitEvent) {
		event.preventDefault();
		scanError = null;
		const value = scanValue.trim();
		if (!value) return;
		scanBusy = true;
		try {
			const res = await fetch(`/api/inventory/barcode-lookup?value=${encodeURIComponent(value)}`);
			const json = (await res.json()) as { ok?: boolean; data?: { item: { id: string } } };
			if (!res.ok || !json.data?.item?.id) {
				scanError = 'No item matched the scanned value.';
				return;
			}
			scanValue = '';
			await goto(`/inventory/items/${json.data.item.id}`);
		} catch (e) {
			scanError = (e as Error).message;
		} finally {
			scanBusy = false;
		}
	}

	function fmtMoney(value: number | null, currency: string) {
		if (value === null || value === undefined) return '-';
		return `${currency} ${value.toFixed(2)}`;
	}
</script>

<PageShell
	eyebrow="Inventory"
	title="Items"
	description="Item master records used by procurement, sales, and warehouse movements. One row per SKU."
>
	<div class="mb-4 flex flex-wrap items-center gap-3">
		<a
			class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]"
			href="/inventory/items/new"
		>
			New item
		</a>
		<a
			class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
			href="/inventory/scan"
		>
			Open barcode scanner
		</a>
	</div>

	<form
		class="mb-4 grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 md:grid-cols-[1fr_auto]"
		onsubmit={onScan}
	>
		<label class="space-y-1 text-sm">
			<span class="font-medium text-emerald-800">Quick scan / barcode lookup</span>
			<input
				bind:value={scanValue}
				class="w-full rounded-md border border-emerald-300 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
				placeholder="Scan or paste a barcode / item code, then press Enter"
				autocomplete="off"
			/>
		</label>
		<div class="flex items-end">
			<button
				type="submit"
				disabled={scanBusy}
				class="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
			>
				{scanBusy ? 'Looking up…' : 'Look up'}
			</button>
		</div>
		{#if scanError}
			<p class="md:col-span-2 text-sm text-rose-600">{scanError}</p>
		{/if}
	</form>

	<form class="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4" method="GET">
		<label class="space-y-1 text-sm md:col-span-2">
			<span class="text-slate-700">Search</span>
			<input
				name="q"
				value={data.filters.q}
				class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
				placeholder="Code, name, category, barcode..."
			/>
		</label>
		<label class="space-y-1 text-sm">
			<span class="text-slate-700">Type</span>
			<select
				name="type"
				class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
			>
				<option value="">All types</option>
				<option value="raw_material" selected={data.filters.type === 'raw_material'}>Raw material</option>
				<option value="finished_good" selected={data.filters.type === 'finished_good'}>Finished good</option>
				<option value="consumable" selected={data.filters.type === 'consumable'}>Consumable</option>
				<option value="sub_assembly" selected={data.filters.type === 'sub_assembly'}>Sub-assembly</option>
				<option value="service" selected={data.filters.type === 'service'}>Service</option>
			</select>
		</label>
		<label class="space-y-1 text-sm">
			<span class="text-slate-700">Status</span>
			<select
				name="status"
				class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
			>
				<option value="">All statuses</option>
				<option value="active" selected={data.filters.status === 'active'}>Active</option>
				<option value="inactive" selected={data.filters.status === 'inactive'}>Inactive</option>
				<option value="discontinued" selected={data.filters.status === 'discontinued'}>Discontinued</option>
			</select>
		</label>
		<div class="md:col-span-4 flex gap-2">
			<button class="rounded-md bg-[var(--sf-green)] px-3 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" type="submit">
				Apply filters
			</button>
			<a class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/inventory/items">
				Reset
			</a>
		</div>
	</form>

	<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-slate-200 text-sm">
			<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
				<tr>
					<th class="px-4 py-3">Image</th>
					<th class="px-4 py-3">Code</th>
					<th class="px-4 py-3">Name</th>
					<th class="px-4 py-3">Type / Status</th>
					<th class="px-4 py-3">UoM</th>
					<th class="px-4 py-3">Min / Reorder / Max</th>
					<th class="px-4 py-3">Lead time</th>
					<th class="px-4 py-3">Valuation</th>
					<th class="px-4 py-3">Lot / Serial</th>
					<th class="px-4 py-3">Barcodes</th>
					<th class="px-4 py-3"></th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#if data.items.length === 0}
					<tr>
						<td colspan="11" class="px-4 py-8 text-center text-slate-500">
							No items yet.
							<a class="font-medium text-[var(--sf-green)] hover:underline" href="/inventory/items/new">Add your first item</a>.
						</td>
					</tr>
				{:else}
					{#each data.items as item}
						{#if pendingDeleteId === item.id}
							<tr class="bg-red-50">
								<td colspan="10" class="px-4 py-3 text-sm font-medium text-red-700">
									Delete <span class="font-semibold">{item.code} — {item.name}</span>? This cannot be undone.
								</td>
								<td class="px-4 py-3">
									<div class="flex items-center gap-2 justify-end">
										<form
											method="POST"
											action="?/delete"
											use:enhance={() => ({ update }) => update({ reset: false })}
										>
											<input type="hidden" name="id" value={item.id} />
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
								<td class="px-4 py-3">
									{#if item.primaryImageUrl}
										<img
											src={item.primaryImageUrl}
											alt={item.name}
											class="h-10 w-10 rounded border border-slate-200 object-cover"
										/>
									{:else}
										<div class="h-10 w-10 rounded border border-dashed border-slate-200 bg-slate-50"></div>
									{/if}
								</td>
								<td class="px-4 py-3 font-mono text-xs text-slate-700">
									<a class="hover:text-[var(--sf-green)] hover:underline" href={`/inventory/items/${item.id}`}>
										{item.code}
									</a>
								</td>
								<td class="px-4 py-3 font-medium text-slate-900">{item.name}</td>
								<td class="px-4 py-3 text-slate-600">
									<div class="capitalize">{item.itemType.replace('_', ' ')}</div>
									<div class="text-xs text-slate-500 capitalize">{item.status}</div>
								</td>
								<td class="px-4 py-3 text-slate-600">{item.uom}</td>
								<td class="px-4 py-3 text-slate-600">
									<div class="text-xs">min {item.minLevel ?? '-'} · ROP {item.reorderPoint ?? '-'} · max {item.maxLevel ?? '-'}</div>
								</td>
								<td class="px-4 py-3 text-slate-600">{item.leadTimeDays ?? '-'} d</td>
								<td class="px-4 py-3 text-slate-600">
									<div class="capitalize">{item.valuationMethod.replace('_', ' ')}</div>
									<div class="text-xs text-slate-500">
										{#if item.valuationMethod === 'standard_cost'}
											std {fmtMoney(item.standardCost, item.currency)}
										{:else}
											last {fmtMoney(item.lastCost, item.currency)}
										{/if}
									</div>
								</td>
								<td class="px-4 py-3 text-slate-600">
									<div class="text-xs">{item.lotControl ? 'Lot' : '-'}</div>
									<div class="text-xs">{item.serialControl ? 'Serial' : '-'}</div>
								</td>
								<td class="px-4 py-3 text-slate-600">
									{#if item.barcodes.length === 0}
										–
									{:else}
										{#each item.barcodes.slice(0, 3) as b}
											<div class="text-xs font-mono">
												{b.barcodeValue}
												<span class="text-slate-400">({b.barcodeType}{b.isPrimary ? ' · pri' : ''})</span>
											</div>
										{/each}
										{#if item.barcodes.length > 3}
											<div class="text-xs text-slate-400">+{item.barcodes.length - 3} more</div>
										{/if}
									{/if}
								</td>
								<td class="px-4 py-3 text-right">
									<a
										class="mr-2 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
										href={`/inventory/items/${item.id}`}
									>
										Edit
									</a>
									<button
										type="button"
										class="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
										onclick={() => (pendingDeleteId = item.id)}
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
