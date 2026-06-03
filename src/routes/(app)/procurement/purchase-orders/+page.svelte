<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import ProcurementSubNav from '$app-layer/components/procurement/ProcurementSubNav.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const money = (value: number | null | undefined, currency = 'SGD') =>
		value === null || value === undefined
			? '-'
			: new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(Number(value));

	let nextPoItemRowId = 2;
	let poItemRows = $state([
		{
			id: 1,
			code: 'MAT-200',
			description: 'Purchased component',
			quantity: 10,
			uom: 'pcs',
			unitPrice: 25,
			taxCode: 'SR',
			itemId: '',
			warehouseId: '',
			binLocationId: '',
			quarantineBinId: '',
			inspectionRequired: false
		}
	]);

	function addPoItemRow() {
		nextPoItemRowId += 1;
		poItemRows = [
			...poItemRows,
			{
				id: nextPoItemRowId,
				code: '',
				description: '',
				quantity: 1,
				uom: 'unit',
				unitPrice: 0,
				taxCode: 'SR',
				itemId: '',
				warehouseId: '',
				binLocationId: '',
				quarantineBinId: '',
				inspectionRequired: false
			}
		];
	}

	function removePoItemRow(id: number) {
		if (poItemRows.length <= 1) return;
		poItemRows = poItemRows.filter((row) => row.id !== id);
	}

	function binsForWarehouse(warehouseId: string) {
		return data.bins.filter((bin) => bin.warehouseId === warehouseId);
	}
	function quarantineBinsForWarehouse(warehouseId: string) {
		return data.bins.filter(
			(bin) => bin.warehouseId === warehouseId && bin.locationType === 'quarantine'
		);
	}

	let showCreate = $state(false);
	let statusFilter = $state<'all' | 'pending_approval' | 'approved' | 'received' | 'partially_received'>('all');
	const filteredPos = $derived(
		statusFilter === 'all'
			? data.purchaseOrders
			: statusFilter === 'pending_approval'
				? data.purchaseOrders.filter((p) => p.approvalStatus === 'pending_approval')
				: data.purchaseOrders.filter((p) => p.status === statusFilter)
	);
</script>

<PageShell
	eyebrow="Procurement"
	title="Purchase Orders"
	description="Approve POs (gated by supplier risk + amount), track supplier acknowledgment, and click into a PO to record goods receipts."
>
	<ProcurementSubNav />

	{#if form?.error}
		<div class="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{form.error}</div>
	{/if}

	<div class="mb-4 flex flex-wrap items-center gap-3">
		<button
			class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]"
			onclick={() => (showCreate = !showCreate)}
		>
			{showCreate ? 'Hide form' : '+ Manual PO'}
		</button>
		<div class="ml-auto flex gap-1 text-xs">
			{#each [
				{ v: 'all', l: 'All' },
				{ v: 'pending_approval', l: 'Pending approval' },
				{ v: 'approved', l: 'Approved' },
				{ v: 'partially_received', l: 'Partial receipt' },
				{ v: 'received', l: 'Received' }
			] as opt}
				<button
					onclick={() => (statusFilter = opt.v as any)}
					class={statusFilter === opt.v
						? 'rounded-md bg-slate-900 px-3 py-1.5 font-semibold text-white'
						: 'rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50'}
				>
					{opt.l}
				</button>
			{/each}
		</div>
	</div>

	{#if showCreate}
		<section class="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<h2 class="text-base font-semibold text-slate-900">Create purchase order (manual)</h2>
			<p class="mt-1 text-xs text-slate-500">
				For POs not raised from an RFQ. RFQ-driven POs are created via "Select winner" on the RFQ detail page.
			</p>
			<form class="mt-4 grid gap-4 md:grid-cols-4" method="POST" action="?/createPurchaseOrder" use:enhance>
				<label class="space-y-1">
					<span class="text-xs font-medium text-slate-600">Supplier</span>
					<select name="supplierId" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
						<option value="">Select supplier</option>
						{#each data.suppliers as supplier}
							<option value={supplier.id}>{supplier.name}</option>
						{/each}
					</select>
				</label>
				<label class="space-y-1">
					<span class="text-xs font-medium text-slate-600">PO No.</span>
					<input name="poNumber" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Auto if blank" />
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
					<input name="sourceId" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
				</label>
				<label class="space-y-1">
					<span class="text-xs font-medium text-slate-600">PO date</span>
					<input type="date" name="poDate" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
				</label>
				<label class="space-y-1">
					<span class="text-xs font-medium text-slate-600">Delivery date</span>
					<input type="date" name="deliveryDate" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
				</label>
				<label class="space-y-1">
					<span class="text-xs font-medium text-slate-600">Currency</span>
					<input name="currency" value="SGD" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
				</label>
				<label class="space-y-1">
					<span class="text-xs font-medium text-slate-600">Tax code</span>
					<select name="taxCode" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
						<option value="SR">SR</option>
						<option value="ZR">ZR</option>
						<option value="ES">ES</option>
						<option value="OP">OP</option>
					</select>
				</label>
				<label class="space-y-1">
					<span class="text-xs font-medium text-slate-600">Incoterms</span>
					<input name="incoterms" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="EXW / FOB / CIF / DDP" />
				</label>
				<label class="space-y-1">
					<span class="text-xs font-medium text-slate-600">Shipping</span>
					<input type="number" step="0.01" min="0" name="shippingAmount" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
				</label>
				<label class="space-y-1">
					<span class="text-xs font-medium text-slate-600">Tax amount</span>
					<input type="number" step="0.01" min="0" name="taxAmount" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
				</label>
				<label class="space-y-1">
					<span class="text-xs font-medium text-slate-600">Duties</span>
					<input type="number" step="0.01" min="0" name="dutiesAmount" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
				</label>
				<label class="space-y-1 md:col-span-2">
					<span class="text-xs font-medium text-slate-600">Project ID</span>
					<input name="projectId" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
				</label>
				<label class="space-y-1 md:col-span-2">
					<span class="text-xs font-medium text-slate-600">Billing address</span>
					<input name="billingAddress" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
				</label>
				<div class="md:col-span-4">
					<div class="mb-2 flex items-center justify-between gap-3">
						<p class="text-xs font-medium text-slate-600">PO items</p>
						<button type="button" onclick={addPoItemRow} class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
							Add line
						</button>
					</div>
					<div class="overflow-x-auto rounded-lg border border-slate-200">
						<table class="min-w-full divide-y divide-slate-100 text-sm">
							<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
								<tr>
									<th class="px-3 py-2">Code</th>
									<th class="min-w-48 px-3 py-2">Description</th>
									<th class="w-24 px-3 py-2">Qty</th>
									<th class="w-20 px-3 py-2">UOM</th>
									<th class="w-28 px-3 py-2">Unit price</th>
									<th class="w-20 px-3 py-2">Tax</th>
									<th class="w-44 px-3 py-2">Inventory item</th>
									<th class="w-36 px-3 py-2">Warehouse</th>
									<th class="w-36 px-3 py-2">Receiving bin</th>
									<th class="w-36 px-3 py-2">Quarantine bin</th>
									<th class="w-20 px-3 py-2">QC?</th>
									<th class="w-16 px-3 py-2"></th>
								</tr>
							</thead>
							<tbody class="divide-y divide-slate-100">
								{#each poItemRows as row (row.id)}
									<tr>
										<td class="px-3 py-2"><input name="poItemCode" bind:value={row.code} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></td>
										<td class="px-3 py-2"><input name="poItemDescription" bind:value={row.description} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></td>
										<td class="px-3 py-2"><input type="number" step="0.01" min="0" name="poItemQuantity" bind:value={row.quantity} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></td>
										<td class="px-3 py-2"><input name="poItemUom" bind:value={row.uom} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></td>
										<td class="px-3 py-2"><input type="number" step="0.01" min="0" name="poItemUnitPrice" bind:value={row.unitPrice} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></td>
										<td class="px-3 py-2">
											<select name="poItemTaxCode" bind:value={row.taxCode} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
												<option value="SR">SR</option>
												<option value="ZR">ZR</option>
												<option value="ES">ES</option>
												<option value="OP">OP</option>
											</select>
										</td>
										<td class="px-3 py-2">
											<select name="poItemInventoryId" bind:value={row.itemId} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
												<option value="">—</option>
												{#each data.inventoryItems as item}
													<option value={item.id}>{item.code} · {item.name}</option>
												{/each}
											</select>
										</td>
										<td class="px-3 py-2">
											<select name="poItemWarehouseId" bind:value={row.warehouseId} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
												<option value="">—</option>
												{#each data.warehouses as wh}
													<option value={wh.id}>{wh.code}</option>
												{/each}
											</select>
										</td>
										<td class="px-3 py-2">
											<select name="poItemBinId" bind:value={row.binLocationId} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
												<option value="">—</option>
												{#each binsForWarehouse(row.warehouseId) as bin}
													<option value={bin.id}>{bin.code}</option>
												{/each}
											</select>
										</td>
										<td class="px-3 py-2">
											<select name="poItemQuarantineBinId" bind:value={row.quarantineBinId} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
												<option value="">—</option>
												{#each quarantineBinsForWarehouse(row.warehouseId) as bin}
													<option value={bin.id}>{bin.code}</option>
												{/each}
											</select>
										</td>
										<td class="px-3 py-2 text-center"><input type="checkbox" name="poItemInspectionRequired" bind:checked={row.inspectionRequired} /></td>
										<td class="px-3 py-2 text-right">
											<button type="button" disabled={poItemRows.length <= 1} onclick={() => removePoItemRow(row.id)} class="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40">Remove</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
				<label class="space-y-1 md:col-span-4">
					<span class="text-xs font-medium text-slate-600">Notes</span>
					<textarea name="notes" class="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"></textarea>
				</label>
				<div class="md:col-span-4">
					<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" type="submit">Create PO</button>
				</div>
			</form>
		</section>
	{/if}

	<section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
		<div class="border-b border-slate-200 px-4 py-3">
			<h2 class="text-base font-semibold text-slate-900">
				Purchase Orders ({filteredPos.length}{statusFilter !== 'all' ? ` / ${data.purchaseOrders.length}` : ''})
			</h2>
		</div>
		<table class="min-w-full divide-y divide-slate-100 text-sm">
			<thead class="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
				<tr>
					<th class="px-4 py-3">PO</th>
					<th class="px-4 py-3">Supplier</th>
					<th class="px-4 py-3">Total</th>
					<th class="px-4 py-3">Status</th>
					<th class="px-4 py-3">Approval</th>
					<th class="px-4 py-3">ACK</th>
					<th class="px-4 py-3">Receipts</th>
					<th class="px-4 py-3">Flags</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#if filteredPos.length === 0}
					<tr><td colspan="8" class="px-4 py-8 text-center text-slate-500">No POs match this filter.</td></tr>
				{:else}
					{#each filteredPos as po}
						{@const acceptedReceipts = (po.receipts ?? []).filter((r: any) => r.status === 'accepted').length}
						{@const pendingQc = (po.receipts ?? []).filter((r: any) => r.inspectionStatus === 'pending').length}
						<tr class="hover:bg-slate-50">
							<td class="px-4 py-3">
								<a class="font-medium text-slate-900 hover:text-[var(--sf-green)] hover:underline" href={`/procurement/purchase-orders/${po.id}`}>
									{po.poNumber}
								</a>
								<div class="text-xs text-slate-500">{po.sourceType.replace('_', ' ')} · {po.poDate}</div>
							</td>
							<td class="px-4 py-3 text-slate-600">{po.supplier?.name ?? '—'}</td>
							<td class="px-4 py-3 text-slate-700">{money(po.totalAmount, po.currency)}</td>
							<td class="px-4 py-3"><span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium capitalize text-slate-700">{po.status.replace('_', ' ')}</span></td>
							<td class="px-4 py-3"><span class="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium capitalize text-blue-700">{po.approvalStatus.replace('_', ' ')}</span></td>
							<td class="px-4 py-3 text-xs capitalize text-slate-600">{po.ackStatus.replace('_', ' ')}</td>
							<td class="px-4 py-3 text-xs text-slate-600">
								{acceptedReceipts} accepted{#if pendingQc > 0} · <span class="font-semibold text-amber-700">{pendingQc} QC pending</span>{/if}
							</td>
							<td class="px-4 py-3">
								<div class="flex flex-wrap gap-1 text-xs">
									{#if po.afterTheFactFlag}<span class="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">After-the-fact</span>{/if}
									{#if po.iaExceptionCode}<span class="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">{po.iaExceptionCode}</span>{/if}
									<span class="rounded-full bg-violet-50 px-2 py-0.5 font-medium capitalize text-violet-700">{po.supplierRiskLevel}</span>
								</div>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</section>
</PageShell>
