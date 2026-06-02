<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const money = (value: number | null | undefined, currency = 'SGD') =>
		value === null || value === undefined
			? '-'
			: new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(Number(value));

	const pct = (value: number | null | undefined) =>
		value === null || value === undefined ? '-' : `${Number(value).toFixed(1)}`;

	let nextItemRowId = 3;
	let itemRows = $state([
		{ id: 1, code: 'MAT-100', description: 'Aluminium sheet 2mm', quantity: 100, uom: 'pcs', targetUnitPrice: 8.5 },
		{ id: 2, code: 'FRT', description: 'Local delivery', quantity: 1, uom: 'lot', targetUnitPrice: 120 }
	]);

	function addItemRow() {
		nextItemRowId += 1;
		itemRows = [...itemRows, { id: nextItemRowId, code: '', description: '', quantity: 1, uom: 'unit', targetUnitPrice: 0 }];
	}

	function removeItemRow(id: number) {
		if (itemRows.length <= 1) return;
		itemRows = itemRows.filter((row) => row.id !== id);
	}

	let nextPoItemRowId = 2;
	let poItemRows = $state([
		{ id: 1, code: 'MAT-200', description: 'Purchased component', quantity: 10, uom: 'pcs', unitPrice: 25, taxCode: 'SR' }
	]);

	function addPoItemRow() {
		nextPoItemRowId += 1;
		poItemRows = [
			...poItemRows,
			{ id: nextPoItemRowId, code: '', description: '', quantity: 1, uom: 'unit', unitPrice: 0, taxCode: 'SR' }
		];
	}

	function removePoItemRow(id: number) {
		if (poItemRows.length <= 1) return;
		poItemRows = poItemRows.filter((row) => row.id !== id);
	}
</script>

<PageShell
	eyebrow="Procurement"
	title="RFQs & Quotation Comparison"
	description="Create RFQs from purchase requisitions or MRP suggestions, invite suppliers, compare quotations, and convert the winning quote to a purchase order."
>
	{#if form?.error}
		<div class="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
			{form.error}
		</div>
	{/if}

	<div class="mb-4 flex flex-wrap gap-3">
		<a class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/procurement/suppliers">
			Suppliers
		</a>
		<a class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/finance/doc-hub/purchase-orders">
			PO documents
		</a>
	</div>

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

	<section class="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
		<h2 class="text-base font-semibold text-slate-900">Create purchase order</h2>
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
					<option value="rfq">RFQ result</option>
					<option value="mrp_suggestion">MRP suggestion</option>
				</select>
			</label>
			<label class="space-y-1">
				<span class="text-xs font-medium text-slate-600">Source ID</span>
				<input name="sourceId" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="PR / RFQ / MRP ref" />
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
					<button
						type="button"
						class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
						onclick={addPoItemRow}
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
								<th class="w-36 px-3 py-2">Unit price</th>
								<th class="w-28 px-3 py-2">Tax</th>
								<th class="w-16 px-3 py-2"></th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-100">
							{#each poItemRows as row (row.id)}
								<tr>
									<td class="px-3 py-2">
										<input name="poItemCode" bind:value={row.code} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
									</td>
									<td class="px-3 py-2">
										<input name="poItemDescription" bind:value={row.description} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
									</td>
									<td class="px-3 py-2">
										<input type="number" step="0.01" min="0" name="poItemQuantity" bind:value={row.quantity} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
									</td>
									<td class="px-3 py-2">
										<input name="poItemUom" bind:value={row.uom} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
									</td>
									<td class="px-3 py-2">
										<input type="number" step="0.01" min="0" name="poItemUnitPrice" bind:value={row.unitPrice} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
									</td>
									<td class="px-3 py-2">
										<select name="poItemTaxCode" bind:value={row.taxCode} class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
											<option value="SR">SR</option>
											<option value="ZR">ZR</option>
											<option value="ES">ES</option>
											<option value="OP">OP</option>
										</select>
									</td>
									<td class="px-3 py-2 text-right">
										<button
											type="button"
											class="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
											disabled={poItemRows.length <= 1}
											onclick={() => removePoItemRow(row.id)}
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
			<label class="space-y-1 md:col-span-4">
				<span class="text-xs font-medium text-slate-600">Notes</span>
				<textarea name="notes" class="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"></textarea>
			</label>
			<div class="md:col-span-4">
				<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" type="submit">
					Create PO
				</button>
			</div>
		</form>
	</section>

	<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
		<section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			<div class="border-b border-slate-200 px-4 py-3">
				<h2 class="text-base font-semibold text-slate-900">RFQ list</h2>
			</div>
			<table class="min-w-full divide-y divide-slate-100 text-sm">
				<thead class="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
					<tr>
						<th class="px-4 py-3">RFQ</th>
						<th class="px-4 py-3">Source</th>
						<th class="px-4 py-3">Quotes</th>
						<th class="px-4 py-3">Best</th>
						<th class="px-4 py-3">Status</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					{#if data.rfqs.length === 0}
						<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500">No RFQs yet.</td></tr>
					{:else}
						{#each data.rfqs as rfq}
							<tr class={data.selectedRfqId === rfq.id ? 'bg-[var(--sf-green-soft)]' : 'hover:bg-slate-50'}>
								<td class="px-4 py-3">
									<a class="font-medium text-slate-900 hover:text-[var(--sf-green)] hover:underline" href={`/procurement/rfqs?rfq=${rfq.id}`}>
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
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</section>

		<section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<h2 class="text-base font-semibold text-slate-900">PO monitoring</h2>
			<div class="mt-3 space-y-3">
				{#if data.purchaseOrders.length === 0}
					<p class="text-sm text-slate-500">No purchase orders yet.</p>
				{:else}
					{#each data.purchaseOrders as po}
						<div class="rounded-md border border-slate-200 p-3 text-sm">
							<div class="flex items-center justify-between gap-3">
								<div>
									<p class="font-medium text-slate-900">{po.poNumber}</p>
									<p class="text-xs text-slate-500">
										{po.supplier?.name ?? po.supplierId ?? 'No supplier'} · {money(po.totalAmount, po.currency)}
									</p>
								</div>
								<div class="flex flex-wrap justify-end gap-1">
									<span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium capitalize text-slate-700">{po.status.replace('_', ' ')}</span>
									<span class="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{po.approvalStatus.replace('_', ' ')}</span>
									<span class="rounded-full bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700">{po.supplierRiskLevel} risk</span>
									{#if po.afterTheFactFlag}
										<span class="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">After-the-fact</span>
									{/if}
									{#if po.iaExceptionCode}
										<span class="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">{po.iaExceptionCode}</span>
									{/if}
								</div>
							</div>
							<p class="mt-2 text-xs text-slate-500">
								{po.sourceType.replace('_', ' ')} {po.sourceId ?? '-'} · PO date {po.poDate} · delivery {po.deliveryDate ?? '-'} · Incoterms {po.incoterms ?? '-'} · ACK {po.ackStatus.replace('_', ' ')}
							</p>
							<div class="mt-3 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
								<div class="flex items-center justify-between">
									<span>Ordered {po.orderedQuantity} · received {po.receivedQuantity} · back-order {po.backOrderedQuantity}</span>
									<span>{po.taxCode ?? '-'} · {po.billingAddress ?? 'No billing address'}</span>
								</div>
							</div>
							{#if po.items.length > 0}
								<div class="mt-3 overflow-x-auto rounded-md border border-slate-100">
									<table class="min-w-full text-xs">
										<thead class="bg-slate-50 text-left text-slate-500">
											<tr>
												<th class="px-2 py-1">Item</th>
												<th class="px-2 py-1">Qty</th>
												<th class="px-2 py-1">Received</th>
												<th class="px-2 py-1">Back-order</th>
											</tr>
										</thead>
										<tbody>
											{#each po.items as item}
												<tr class="border-t border-slate-100">
													<td class="px-2 py-1">{item.description}</td>
													<td class="px-2 py-1">{item.quantity} {item.uom}</td>
													<td class="px-2 py-1">{item.receivedQuantity}</td>
													<td class="px-2 py-1">{item.backOrderedQuantity}</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
							<div class="mt-3 grid gap-2">
								{#if po.approvalStatus === 'pending_approval'}
									<form class="grid grid-cols-[1fr_auto_auto] gap-2" method="POST" action="?/approvePurchaseOrder" use:enhance>
										<input type="hidden" name="poId" value={po.id} />
										<input name="reason" class="rounded-md border border-slate-300 px-2 py-1 text-xs" placeholder="Rejection reason" />
										<button name="approvalAction" value="approve" class="rounded-md bg-[var(--sf-green)] px-3 py-1.5 text-xs font-medium text-white" type="submit">Approve</button>
										<button name="approvalAction" value="reject" class="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700" type="submit">Reject</button>
									</form>
								{/if}
								<form class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" method="POST" action="?/acknowledgePurchaseOrder" use:enhance>
									<input type="hidden" name="poId" value={po.id} />
									<select name="ackStatus" class="rounded-md border border-slate-300 px-2 py-1.5 text-xs">
										<option value="requested">Request ACK</option>
										<option value="acknowledged">Acknowledged</option>
										<option value="rejected">Rejected</option>
										<option value="overdue">Overdue</option>
									</select>
									<input name="supplierAckReference" class="rounded-md border border-slate-300 px-2 py-1.5 text-xs" placeholder="Supplier ref" />
									<button class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700" type="submit">Update ACK</button>
								</form>
								{#if po.items.length > 0}
									<form class="grid gap-2 sm:grid-cols-2" method="POST" action="?/receivePurchaseOrder" use:enhance>
										<input type="hidden" name="poId" value={po.id} />
										<select name="poItemId" class="rounded-md border border-slate-300 px-2 py-1.5 text-xs">
											{#each po.items as item}
												<option value={item.id}>{item.description}</option>
											{/each}
										</select>
										<input type="date" name="receiptDate" class="rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
										<input name="receiptNumber" class="rounded-md border border-slate-300 px-2 py-1.5 text-xs" placeholder="GRN no. auto" />
										<input type="number" step="0.01" min="0" name="quantityReceived" class="rounded-md border border-slate-300 px-2 py-1.5 text-xs" placeholder="Received qty" />
										<input type="number" step="0.01" min="0" name="acceptedQuantity" class="rounded-md border border-slate-300 px-2 py-1.5 text-xs" placeholder="Accepted qty" />
										<input type="number" step="0.01" min="0" name="rejectedQuantity" class="rounded-md border border-slate-300 px-2 py-1.5 text-xs" placeholder="Rejected qty" />
										<button class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white sm:col-span-2" type="submit">Record receipt</button>
									</form>
								{/if}
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</section>
	</div>

	{#if data.comparison}
		<section class="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
			<div class="border-b border-slate-200 px-4 py-3">
				<h2 class="text-base font-semibold text-slate-900">Quotation comparison · {data.comparison.rfq.rfqNumber}</h2>
				<p class="mt-1 text-sm text-slate-500">{data.comparison.rfq.title}</p>
			</div>
			<div class="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-slate-100 text-sm">
						<thead class="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
							<tr>
								<th class="px-3 py-2">Supplier</th>
								<th class="px-3 py-2">Total cost</th>
								<th class="px-3 py-2">Lead time</th>
								<th class="px-3 py-2">Rating</th>
								<th class="px-3 py-2">Terms</th>
								<th class="px-3 py-2">Validity</th>
								<th class="px-3 py-2"></th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-100">
							{#if data.comparison.quotations.length === 0}
								<tr><td colspan="7" class="px-3 py-8 text-center text-slate-500">No supplier quotations submitted yet.</td></tr>
							{:else}
								{#each data.comparison.quotations as quote}
									<tr class={quote.status === 'selected' ? 'bg-green-50' : ''}>
										<td class="px-3 py-2">
											<div class="font-medium text-slate-900">{quote.supplier?.name ?? quote.supplierId}</div>
											<div class="text-xs text-slate-500">{quote.quotationNumber ?? '-'}</div>
										</td>
										<td class="px-3 py-2 text-slate-700">
											<div class="font-medium">{money(quote.totalCost, quote.currency)}</div>
											<div class="text-xs text-slate-500">
												base {money(quote.totalCostAnalysis.subtotal, quote.currency)} · ship {money(quote.totalCostAnalysis.shipping, quote.currency)} · tax {money(quote.totalCostAnalysis.tax, quote.currency)} · duties {money(quote.totalCostAnalysis.duties, quote.currency)}
											</div>
										</td>
										<td class="px-3 py-2 text-slate-600">{quote.leadTimeDays ?? '-'} days</td>
										<td class="px-3 py-2 text-slate-600">{pct(quote.supplierRatingSnapshot)}</td>
										<td class="px-3 py-2 text-slate-600">
											<div>{quote.deliveryTerms ?? '-'}</div>
											<div class="text-xs text-slate-500">{quote.paymentTerms ?? '-'}</div>
										</td>
										<td class="px-3 py-2 text-slate-600">{quote.validityDate ?? '-'}</td>
										<td class="px-3 py-2">
											{#if quote.status === 'selected'}
												<span class="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">Selected</span>
											{:else if !data.comparison.purchaseOrder}
												<form class="space-y-2" method="POST" action="?/selectWinner" use:enhance>
													<input type="hidden" name="rfqId" value={data.comparison.rfq.id} />
													<input type="hidden" name="quotationId" value={quote.id} />
													<input name="poNumber" class="w-full rounded border border-slate-300 px-2 py-1 text-xs" placeholder="PO no. auto" />
													<input type="date" name="poDate" class="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
													<input type="date" name="deliveryDate" class="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
													<input type="date" name="goodsReceiptDate" class="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
													<select name="taxCode" class="w-full rounded border border-slate-300 px-2 py-1 text-xs">
														<option value="SR">SR</option>
														<option value="ZR">ZR</option>
														<option value="ES">ES</option>
														<option value="OP">OP</option>
													</select>
													<input name="incoterms" class="w-full rounded border border-slate-300 px-2 py-1 text-xs" placeholder="Incoterms" />
													<input name="billingAddress" class="w-full rounded border border-slate-300 px-2 py-1 text-xs" placeholder="Billing address" />
													<select name="status" class="w-full rounded border border-slate-300 px-2 py-1 text-xs">
														<option value="draft">Draft</option>
														<option value="approved">Approved</option>
														<option value="sent">Sent</option>
														<option value="confirmed">Confirmed</option>
														<option value="received">Received</option>
													</select>
													<button class="w-full rounded bg-[var(--sf-green)] px-2 py-1.5 text-xs font-medium text-white" type="submit">
														Select & create PO
													</button>
												</form>
											{/if}
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>

				<form class="rounded-lg border border-slate-200 p-3" method="POST" action="?/submitQuotation" use:enhance>
					<h3 class="text-sm font-semibold text-slate-900">Submit supplier quotation</h3>
					<input type="hidden" name="rfqId" value={data.comparison.rfq.id} />
					<div class="mt-3 grid gap-2">
						<label class="space-y-1">
							<span class="text-xs font-medium text-slate-600">Supplier</span>
							<select name="supplierId" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
								{#each data.comparison.invitations as invitation}
									<option value={invitation.supplierId}>{invitation.supplier?.name ?? invitation.supplierId}</option>
								{/each}
							</select>
						</label>
						<label class="space-y-1">
							<span class="text-xs font-medium text-slate-600">Quotation no.</span>
							<input name="quotationNumber" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
						</label>
						<div class="grid grid-cols-2 gap-2">
							<label class="space-y-1">
								<span class="text-xs font-medium text-slate-600">Lead time days</span>
								<input type="number" step="1" min="0" name="leadTimeDays" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
							</label>
							<label class="space-y-1">
								<span class="text-xs font-medium text-slate-600">Valid until</span>
								<input type="date" name="validityDate" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
							</label>
						</div>
						{#each data.comparison.items as item}
							<div class="rounded-md border border-slate-200 p-2">
								<p class="text-xs font-medium text-slate-700">{item.description}</p>
								<div class="mt-2 grid grid-cols-2 gap-2">
									<input type="number" step="0.01" min="0" name={`qty_${item.id}`} value={item.quantity} class="rounded-md border border-slate-300 px-2 py-1 text-sm" />
									<input type="number" step="0.01" min="0" name={`price_${item.id}`} class="rounded-md border border-slate-300 px-2 py-1 text-sm" placeholder="Unit price" />
								</div>
							</div>
						{/each}
						<div class="grid grid-cols-2 gap-2">
							<input type="number" step="0.01" min="0" name="shippingAmount" class="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Shipping" />
							<input type="number" step="0.01" min="0" name="taxAmount" class="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Tax" />
							<input type="number" step="0.01" min="0" name="dutiesAmount" class="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Duties" />
							<input type="number" step="0.01" min="0" name="discountAmount" class="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Discount" />
						</div>
						<input name="deliveryTerms" class="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Delivery terms" />
						<input name="paymentTerms" class="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Payment terms" />
						<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" type="submit">
							Submit quotation
						</button>
					</div>
				</form>
			</div>
		</section>
	{/if}
</PageShell>
