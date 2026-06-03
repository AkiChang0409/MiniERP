<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import ProcurementSubNav from '$app-layer/components/procurement/ProcurementSubNav.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const money = (value: number | null | undefined, currency = 'SGD') =>
		value === null || value === undefined
			? '-'
			: new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(Number(value));

	let nextItemRowId = 3;
	let itemRows = $state([
		{
			id: 1,
			code: 'MAT-100',
			description: 'Aluminium sheet 2mm',
			quantity: 100,
			uom: 'pcs',
			targetUnitPrice: 8.5
		},
		{ id: 2, code: 'FRT', description: 'Local delivery', quantity: 1, uom: 'lot', targetUnitPrice: 120 }
	]);

	function addItemRow() {
		nextItemRowId += 1;
		itemRows = [
			...itemRows,
			{ id: nextItemRowId, code: '', description: '', quantity: 1, uom: 'unit', targetUnitPrice: 0 }
		];
	}

	function removeItemRow(id: number) {
		if (itemRows.length <= 1) return;
		itemRows = itemRows.filter((row) => row.id !== id);
	}

	let showCreate = $state(data.rfqs.length === 0);
</script>

<PageShell
	eyebrow="Procurement"
	title="Request for Quotation"
	description="Create a Request for Quotation, invite suppliers, and collect their prices. Pick a row to compare quotations and select a winner."
>
	<ProcurementSubNav />

	{#if form?.error}
		<div class="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
			{form.error}
		</div>
	{/if}

	<div class="mb-4 flex flex-wrap gap-3">
		<button
			class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]"
			onclick={() => (showCreate = !showCreate)}
		>
			{showCreate ? 'Hide form' : '+ New RFQ'}
		</button>
		<a
			class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
			href="/procurement/suppliers"
		>
			Suppliers
		</a>
	</div>

	{#if showCreate}
		<section class="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<h2 class="text-base font-semibold text-slate-900">Create RFQ</h2>
			<form class="mt-4 grid gap-4 md:grid-cols-4" method="POST" action="?/createRfq" use:enhance>
				<label class="space-y-1 md:col-span-2">
					<span class="text-xs font-medium text-slate-600">Title</span>
					<input name="title" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Raw material purchase for Project A" />
				</label>
				<label class="space-y-1">
					<span class="text-xs font-medium text-slate-600">RFQ No.</span>
					<input name="rfqNumber" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Auto if blank" />
				</label>
				<label class="space-y-1">
					<span class="text-xs font-medium text-slate-600">Currency</span>
					<input name="currency" value="SGD" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
				</label>
				<label class="space-y-1">
					<span class="text-xs font-medium text-slate-600">Source</span>
					<select name="sourceType" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
						<option value="manual">Manual</option>
						<option value="purchase_requisition">Purchase requisition</option>
						<option value="mrp_suggestion">MRP suggestion</option>
					</select>
				</label>
				<label class="space-y-1">
					<span class="text-xs font-medium text-slate-600">Source ID</span>
					<input name="sourceId" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="PR-1024 / MRP-55" />
				</label>
				<label class="space-y-1">
					<span class="text-xs font-medium text-slate-600">Project ID</span>
					<input name="projectId" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
				</label>
				<label class="space-y-1">
					<span class="text-xs font-medium text-slate-600">Required by</span>
					<input type="date" name="requiredByDate" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
				</label>
				<div class="md:col-span-4">
					<div class="mb-2 flex items-center justify-between gap-3">
						<p class="text-xs font-medium text-slate-600">Items</p>
						<button
							type="button"
							class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
							onclick={addItemRow}
						>
							Add line
						</button>
					</div>
					<div class="overflow-x-auto rounded-lg border border-slate-200">
						<table class="min-w-full divide-y divide-slate-100 text-sm">
							<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
								<tr>
									<th class="px-3 py-2">Code</th>
									<th class="min-w-64 px-3 py-2">Description</th>
									<th class="w-28 px-3 py-2">Qty</th>
									<th class="w-28 px-3 py-2">UOM</th>
									<th class="w-40 px-3 py-2">Target unit price</th>
									<th class="w-16 px-3 py-2"></th>
								</tr>
							</thead>
							<tbody class="divide-y divide-slate-100">
								{#each itemRows as row (row.id)}
									<tr>
										<td class="px-3 py-2">
											<input name="itemCode" bind:value={row.code} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
										</td>
										<td class="px-3 py-2">
											<input name="itemDescription" bind:value={row.description} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
										</td>
										<td class="px-3 py-2">
											<input type="number" step="0.01" min="0" name="itemQuantity" bind:value={row.quantity} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
										</td>
										<td class="px-3 py-2">
											<input name="itemUom" bind:value={row.uom} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
										</td>
										<td class="px-3 py-2">
											<input type="number" step="0.01" min="0" name="itemTargetUnitPrice" bind:value={row.targetUnitPrice} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
										</td>
										<td class="px-3 py-2 text-right">
											<button
												type="button"
												class="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
												disabled={itemRows.length <= 1}
												onclick={() => removeItemRow(row.id)}
											>
												Remove
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
				<div class="md:col-span-4">
					<p class="mb-2 text-xs font-medium text-slate-600">Invite suppliers</p>
					<div class="grid gap-2 md:grid-cols-3">
						{#each data.suppliers as supplier}
							<label class="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
								<input type="checkbox" name="supplierIds" value={supplier.id} />
								<span class="min-w-0 truncate">{supplier.name}</span>
								<span class="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
									{supplier.profile?.supplierStatus ?? 'approved'}
								</span>
							</label>
						{/each}
					</div>
				</div>
				<label class="flex items-center gap-2 text-sm text-slate-700 md:col-span-4">
					<input type="checkbox" name="sendImmediately" checked />
					<span>Mark invitations as sent</span>
				</label>
				<label class="space-y-1 md:col-span-4">
					<span class="text-xs font-medium text-slate-600">Notes</span>
					<textarea name="notes" class="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"></textarea>
				</label>
				<div class="md:col-span-4">
					<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" type="submit">
						Create and send RFQ
					</button>
				</div>
			</form>
		</section>
	{/if}

	<section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
		<div class="border-b border-slate-200 px-4 py-3">
			<h2 class="text-base font-semibold text-slate-900">RFQ list ({data.rfqs.length})</h2>
		</div>
		<table class="min-w-full divide-y divide-slate-100 text-sm">
			<thead class="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
				<tr>
					<th class="px-4 py-3">RFQ</th>
					<th class="px-4 py-3">Source</th>
					<th class="px-4 py-3">Quotes</th>
					<th class="px-4 py-3">Best</th>
					<th class="px-4 py-3">Status</th>
					<th class="px-4 py-3">PO</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#if data.rfqs.length === 0}
					<tr>
						<td colspan="6" class="px-4 py-8 text-center text-slate-500">No RFQs yet — create one above.</td>
					</tr>
				{:else}
					{#each data.rfqs as rfq}
						<tr class="hover:bg-slate-50">
							<td class="px-4 py-3">
								<a class="font-medium text-slate-900 hover:text-[var(--sf-green)] hover:underline" href={`/procurement/rfqs/${rfq.id}`}>
									{rfq.rfqNumber}
								</a>
								<div class="text-xs text-slate-500">{rfq.title}</div>
							</td>
							<td class="px-4 py-3 text-slate-600">
								<div>{rfq.sourceType.replace('_', ' ')}</div>
								<div class="text-xs text-slate-500">{rfq.sourceId ?? '-'}</div>
							</td>
							<td class="px-4 py-3 text-slate-600">{rfq.quotationCount} / {rfq.supplierCount}</td>
							<td class="px-4 py-3 text-slate-600">{money(rfq.bestTotalCost, rfq.currency)}</td>
							<td class="px-4 py-3">
								<span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium capitalize text-slate-700">{rfq.status}</span>
							</td>
							<td class="px-4 py-3 text-xs">
								{#if rfq.purchaseOrder}
									<a
										class="rounded-full bg-green-100 px-2 py-1 font-semibold text-green-800 hover:bg-green-200"
										href={`/procurement/purchase-orders/${rfq.purchaseOrder.id}`}
									>
										{rfq.purchaseOrder.poNumber}
									</a>
								{:else}
									<span class="text-slate-400">—</span>
								{/if}
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</section>
</PageShell>
