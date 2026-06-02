<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const formAny = $derived(form as { message?: string; savedWarehouse?: boolean; savedBin?: boolean; deletedBin?: boolean } | null | undefined);

	const wh = $derived(data.warehouse);

	const stockByBin = $derived(() => {
		const map = new Map<string, { onHand: number; reserved: number }>();
		for (const row of data.stockLevels) {
			const bid = row.bin.id;
			const existing = map.get(bid) ?? { onHand: 0, reserved: 0 };
			existing.onHand += Number(row.level.quantityOnHand) || 0;
			existing.reserved += Number(row.level.quantityReserved) || 0;
			map.set(bid, existing);
		}
		return map;
	});
</script>

<PageShell
	eyebrow="Inventory · Warehouse"
	title={`${wh.code} — ${wh.name}`}
	description="Edit warehouse master data and manage bin locations. Stock summary shows current quantity per bin."
>
	<div class="mb-4 flex flex-wrap items-center gap-3">
		<a href="/inventory/warehouses" class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Back</a>
		<a href={`/inventory/stock?warehouseId=${wh.id}`} class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">View stock in this warehouse</a>
		<form method="POST" action="?/deleteWarehouse" use:enhance class="inline-flex">
			<button class="rounded-md border border-rose-300 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">Delete warehouse</button>
		</form>
	</div>

	{#if formAny?.message}
		<p class="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{formAny.message}</p>
	{/if}
	{#if formAny?.savedWarehouse || formAny?.savedBin || formAny?.deletedBin}
		<p class="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Saved.</p>
	{/if}

	<!-- Warehouse master form -->
	<form method="POST" action="?/updateWarehouse" class="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm mb-8">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Master data</h2>
		<div class="grid gap-3 md:grid-cols-2">
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Code</span>
				<input name="code" required value={wh.code} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Name</span>
				<input name="name" required value={wh.name} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Status</span>
				<select name="status" class="w-full rounded-md border border-slate-300 px-3 py-2">
					<option value="active" selected={wh.status === 'active'}>Active</option>
					<option value="inactive" selected={wh.status === 'inactive'}>Inactive</option>
				</select>
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Country</span>
				<input name="country" value={wh.country ?? 'Singapore'} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm md:col-span-2">
				<span class="text-slate-700">Address line 1</span>
				<input name="addressLine1" value={wh.addressLine1 ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm md:col-span-2">
				<span class="text-slate-700">Address line 2</span>
				<input name="addressLine2" value={wh.addressLine2 ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">City</span>
				<input name="city" value={wh.city ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">State</span>
				<input name="state" value={wh.state ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Postal code</span>
				<input name="postalCode" value={wh.postalCode ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Contact name</span>
				<input name="contactName" value={wh.contactName ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Phone</span>
				<input name="contactPhone" value={wh.contactPhone ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Email</span>
				<input name="contactEmail" value={wh.contactEmail ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm md:col-span-2">
				<span class="text-slate-700">Notes</span>
				<textarea name="notes" rows="2" class="w-full rounded-md border border-slate-300 px-3 py-2">{wh.notes ?? ''}</textarea>
			</label>
		</div>
		<div class="text-right">
			<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]">Save warehouse</button>
		</div>
	</form>

	<!-- Bin locations -->
	<section class="space-y-4">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Bin locations</h2>

		<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
			<table class="min-w-full divide-y divide-slate-200 text-sm">
				<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
					<tr>
						<th class="px-4 py-3">Code</th>
						<th class="px-4 py-3">Name</th>
						<th class="px-4 py-3">Type</th>
						<th class="px-4 py-3">Aisle / Rack / Shelf / Bin</th>
						<th class="px-4 py-3">Barcode</th>
						<th class="px-4 py-3">Flags</th>
						<th class="px-4 py-3 text-right">On hand</th>
						<th class="px-4 py-3"></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					{#if data.bins.length === 0}
						<tr><td colspan="8" class="px-4 py-6 text-center text-slate-500">No bins yet. Add one below.</td></tr>
					{:else}
						{#each data.bins as bin}
							<tr class="hover:bg-slate-50/80">
								<td class="px-4 py-3 font-mono text-xs">{bin.code}</td>
								<td class="px-4 py-3">{bin.name ?? '—'}</td>
								<td class="px-4 py-3 capitalize text-slate-600">{bin.locationType.replace('_', ' ')}</td>
								<td class="px-4 py-3 text-xs text-slate-600">
									{[bin.aisle, bin.rack, bin.shelf, bin.bin].filter(Boolean).join(' · ') || '—'}
								</td>
								<td class="px-4 py-3 font-mono text-xs">{bin.barcode ?? '—'}</td>
								<td class="px-4 py-3 text-xs text-slate-600">
									{bin.isPickable ? 'pick' : '—'} · {bin.isReceivable ? 'recv' : '—'} {bin.isDefaultPutaway ? '· default' : ''}
								</td>
								<td class="px-4 py-3 text-right font-mono">
									{(stockByBin().get(bin.id)?.onHand ?? 0).toFixed(2)}
								</td>
								<td class="px-4 py-3 text-right">
									<form method="POST" action="?/deleteBin" use:enhance class="inline">
										<input type="hidden" name="binId" value={bin.id} />
										<button class="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50">Delete</button>
									</form>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

		<form method="POST" action="?/createBin" class="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
			<h3 class="text-sm font-semibold text-emerald-800">Add bin location</h3>
			<div class="grid gap-3 md:grid-cols-4">
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Code<span class="text-rose-600"> *</span></span>
					<input name="code" required class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="A1-01-S2-B3" />
				</label>
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Name</span>
					<input name="name" class="w-full rounded-md border border-slate-300 px-3 py-2" />
				</label>
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Type</span>
					<select name="locationType" class="w-full rounded-md border border-slate-300 px-3 py-2">
						<option value="raw_material">Raw material</option>
						<option value="wip">WIP</option>
						<option value="finished_goods">Finished goods</option>
						<option value="quarantine">Quarantine</option>
						<option value="picking">Picking</option>
						<option value="shipping">Shipping</option>
						<option value="staging">Staging</option>
						<option value="general" selected>General</option>
					</select>
				</label>
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Barcode</span>
					<input name="barcode" class="w-full rounded-md border border-slate-300 px-3 py-2 font-mono" />
				</label>
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Aisle</span>
					<input name="aisle" class="w-full rounded-md border border-slate-300 px-3 py-2" />
				</label>
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Rack</span>
					<input name="rack" class="w-full rounded-md border border-slate-300 px-3 py-2" />
				</label>
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Shelf</span>
					<input name="shelf" class="w-full rounded-md border border-slate-300 px-3 py-2" />
				</label>
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Bin</span>
					<input name="bin" class="w-full rounded-md border border-slate-300 px-3 py-2" />
				</label>
				<label class="flex items-center gap-2 text-sm">
					<input type="checkbox" name="isPickable" checked class="rounded border-slate-300" />
					<span>Pickable</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<input type="checkbox" name="isReceivable" checked class="rounded border-slate-300" />
					<span>Receivable</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<input type="checkbox" name="isDefaultPutaway" class="rounded border-slate-300" />
					<span>Default putaway</span>
				</label>
			</div>
			<label class="block text-sm">
				<span class="text-slate-700">Notes</span>
				<textarea name="notes" rows="2" class="w-full rounded-md border border-slate-300 px-3 py-2"></textarea>
			</label>
			<div class="text-right">
				<button class="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">Add bin</button>
			</div>
		</form>
	</section>
</PageShell>
