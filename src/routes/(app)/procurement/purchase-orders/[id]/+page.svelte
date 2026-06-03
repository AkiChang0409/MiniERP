<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import ProcurementSubNav from '$app-layer/components/procurement/ProcurementSubNav.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const money = (value: number | null | undefined, currency = 'SGD') =>
		value === null || value === undefined
			? '-'
			: new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(Number(value));

	const po = $derived(data.po);
	const defaultLine = $derived(po.items[0] ?? null);
	const pendingReceipts = $derived((po.receipts ?? []).filter((r: any) => r.inspectionStatus === 'pending' || r.inspectionStatus === 'quarantined'));
</script>

<PageShell
	eyebrow="Procurement · PO"
	title={po.poNumber}
	description={po.supplier?.name ?? po.supplierId ?? 'No supplier'}
>
	<ProcurementSubNav />

	{#if form?.error}
		<div class="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{form.error}</div>
	{/if}

	<div class="mb-4 flex flex-wrap items-center gap-3 text-xs">
		<a href="/procurement/purchase-orders" class="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50">← Back to PO list</a>
		<span class="rounded-full bg-slate-100 px-2 py-1 capitalize text-slate-700">{po.status.replace('_', ' ')}</span>
		<span class="rounded-full bg-blue-50 px-2 py-1 capitalize text-blue-700">{po.approvalStatus.replace('_', ' ')}</span>
		<span class="rounded-full bg-violet-50 px-2 py-1 capitalize text-violet-700">{po.supplierRiskLevel} risk</span>
		<span class="text-slate-500">ACK: {po.ackStatus.replace('_', ' ')}</span>
		<span class="text-slate-500">{money(po.totalAmount, po.currency)}</span>
		{#if po.iaExceptionCode}<span class="rounded-full bg-red-100 px-2 py-1 font-semibold text-red-700">{po.iaExceptionCode}</span>{/if}
		{#if po.afterTheFactFlag}<span class="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800">After-the-fact</span>{/if}
	</div>

	<div class="grid gap-4 lg:grid-cols-3">
		<section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
			<h2 class="text-base font-semibold text-slate-900">Order details</h2>
			<dl class="mt-3 grid gap-2 text-xs sm:grid-cols-2">
				<div><dt class="text-slate-500">Source</dt><dd class="font-medium text-slate-900">{po.sourceType.replace('_', ' ')} {po.sourceId ?? ''}</dd></div>
				<div><dt class="text-slate-500">PO date</dt><dd class="font-medium text-slate-900">{po.poDate}</dd></div>
				<div><dt class="text-slate-500">Delivery date</dt><dd class="font-medium text-slate-900">{po.deliveryDate ?? '—'}</dd></div>
				<div><dt class="text-slate-500">Incoterms</dt><dd class="font-medium text-slate-900">{po.incoterms ?? '—'}</dd></div>
				<div><dt class="text-slate-500">Tax code</dt><dd class="font-medium text-slate-900">{po.taxCode ?? '—'}</dd></div>
				<div><dt class="text-slate-500">Billing address</dt><dd class="font-medium text-slate-900">{po.billingAddress ?? '—'}</dd></div>
			</dl>

			<div class="mt-4 overflow-x-auto rounded-md border border-slate-100">
				<table class="min-w-full text-xs">
					<thead class="bg-slate-50 text-left text-slate-500">
						<tr>
							<th class="px-2 py-1">Item</th>
							<th class="px-2 py-1">Qty</th>
							<th class="px-2 py-1">Received</th>
							<th class="px-2 py-1">Back-order</th>
							<th class="px-2 py-1">Unit price</th>
							<th class="px-2 py-1">Line total</th>
						</tr>
					</thead>
					<tbody>
						{#each po.items as item}
							<tr class="border-t border-slate-100">
								<td class="px-2 py-1">
									<div class="font-medium">{item.description}</div>
									<div class="text-slate-500">{item.itemCode ?? ''}</div>
								</td>
								<td class="px-2 py-1">{item.quantity} {item.uom}</td>
								<td class="px-2 py-1">{item.receivedQuantity}</td>
								<td class="px-2 py-1">{item.backOrderedQuantity}</td>
								<td class="px-2 py-1">{money(item.unitPrice, po.currency)}</td>
								<td class="px-2 py-1">{money(item.lineSubtotal, po.currency)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="space-y-3">
			{#if po.approvalStatus === 'pending_approval'}
				<form class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs" method="POST" action="?/approvePurchaseOrder" use:enhance>
					<h3 class="text-sm font-semibold text-amber-900">Approval required</h3>
					<p class="mt-1 text-amber-800">Threshold {money(po.approvalThresholdAmount, po.currency)} · supplier risk {po.supplierRiskLevel}.</p>
					<input name="reason" class="mt-2 w-full rounded border border-amber-200 px-2 py-1" placeholder="Rejection reason (if rejecting)" />
					<div class="mt-2 flex gap-2">
						<button name="approvalAction" value="approve" class="rounded bg-[var(--sf-green)] px-3 py-1 font-medium text-white">Approve</button>
						<button name="approvalAction" value="reject" class="rounded border border-red-300 px-3 py-1 font-medium text-red-700">Reject</button>
					</div>
				</form>
			{/if}

			<form class="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-sm" method="POST" action="?/acknowledgePurchaseOrder" use:enhance>
				<h3 class="text-sm font-semibold text-slate-900">Supplier acknowledgment</h3>
				<div class="mt-2 grid gap-2">
					<select name="ackStatus" class="w-full rounded border border-slate-300 px-2 py-1.5">
						<option value="requested">Request ACK</option>
						<option value="acknowledged">Acknowledged</option>
						<option value="rejected">Rejected</option>
						<option value="overdue">Overdue</option>
					</select>
					<input name="supplierAckReference" class="w-full rounded border border-slate-300 px-2 py-1.5" placeholder="Supplier ref" />
					<button class="w-full rounded border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Update</button>
				</div>
			</form>
		</section>
	</div>

	<section class="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
		<h2 class="text-base font-semibold text-slate-900">Record goods receipt (GRN)</h2>
		<p class="mt-1 text-xs text-slate-500">
			Pick the PO line being received. Inventory linkage is preloaded from the PO; QC routing falls back to supplier defaults.
		</p>
		{#if defaultLine}
			<form class="mt-4 grid gap-2 sm:grid-cols-3 rounded-md border border-dashed border-slate-300 bg-slate-50 p-3" method="POST" action="?/receivePurchaseOrder" use:enhance>
				<label class="space-y-1 sm:col-span-3">
					<span class="text-[10px] uppercase tracking-wide text-slate-500">PO line</span>
					<select
						name="poItemId"
						class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
						onchange={(e) => {
							const lineId = (e.currentTarget as HTMLSelectElement).value;
							const line = po.items.find((l: any) => l.id === lineId);
							if (!line) return;
							const f = (e.currentTarget as HTMLSelectElement).form!;
							(f.elements.namedItem('itemId') as HTMLInputElement).value = line.itemId ?? '';
							(f.elements.namedItem('warehouseId') as HTMLInputElement).value = line.warehouseId ?? '';
							(f.elements.namedItem('binLocationId') as HTMLInputElement).value = line.binLocationId ?? '';
							(f.elements.namedItem('quarantineBinId') as HTMLInputElement).value = line.quarantineBinId ?? '';
							(f.elements.namedItem('inspectionRequired') as HTMLInputElement).checked = Boolean(line.inspectionRequired);
							(f.elements.namedItem('unitCost') as HTMLInputElement).value = String(line.unitPrice ?? 0);
						}}
					>
						{#each po.items as item}
							<option value={item.id}>{item.description} (ordered {item.quantity}, received {item.receivedQuantity})</option>
						{/each}
					</select>
				</label>
				<input type="date" name="receiptDate" class="rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
				<input name="receiptNumber" class="rounded-md border border-slate-300 px-2 py-1.5 text-xs" placeholder="GRN no. auto" />
				<input type="number" step="0.01" min="0" name="unitCost" value={defaultLine?.unitPrice ?? 0} class="rounded-md border border-slate-300 px-2 py-1.5 text-xs" placeholder="Unit cost" />
				<input type="number" step="0.01" min="0" name="quantityReceived" class="rounded-md border border-slate-300 px-2 py-1.5 text-xs" placeholder="Received qty" />
				<input type="number" step="0.01" min="0" name="acceptedQuantity" class="rounded-md border border-slate-300 px-2 py-1.5 text-xs" placeholder="Accept qty (no-QC)" />
				<input type="number" step="0.01" min="0" name="rejectedQuantity" class="rounded-md border border-slate-300 px-2 py-1.5 text-xs" placeholder="Reject qty (no-QC)" />
				<input type="hidden" name="itemId" value={defaultLine?.itemId ?? ''} />
				<input type="hidden" name="warehouseId" value={defaultLine?.warehouseId ?? ''} />
				<input type="hidden" name="binLocationId" value={defaultLine?.binLocationId ?? ''} />
				<input type="hidden" name="quarantineBinId" value={defaultLine?.quarantineBinId ?? ''} />
				<label class="flex items-center gap-2 text-[11px] text-slate-600 sm:col-span-2">
					<input type="checkbox" name="inspectionRequired" checked={Boolean(defaultLine?.inspectionRequired)} />
					<span>Route to quality inspection</span>
				</label>
				<input name="notes" class="rounded-md border border-slate-300 px-2 py-1.5 text-xs sm:col-span-3" placeholder="GRN notes" />
				<button class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white sm:col-span-3" type="submit">Record goods receipt</button>
			</form>
		{/if}
	</section>

	{#if pendingReceipts.length > 0}
		<section class="mt-6 rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
			<h2 class="text-base font-semibold text-amber-900">Awaiting QC decision ({pendingReceipts.length})</h2>
			<div class="mt-3 space-y-2">
				{#each pendingReceipts as receipt}
					<div class="rounded-md border border-amber-200 bg-white p-3 text-xs">
						<div class="flex items-center justify-between">
							<div>
								<p class="font-semibold text-slate-800">{receipt.receiptNumber} · {receipt.receiptDate}</p>
								<p class="text-[11px] text-slate-500">qty {receipt.quantityReceived}{#if receipt.overReceiptFlag} · <span class="font-medium text-amber-700">over-receipt</span>{/if}</p>
							</div>
							<span class={
								receipt.inspectionStatus === 'pending'
									? 'rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800'
									: 'rounded-full bg-purple-100 px-2 py-0.5 font-medium text-purple-700'
							}>QC: {receipt.inspectionStatus}</span>
						</div>
						<form class="mt-2 grid gap-1 sm:grid-cols-[1fr_1fr_2fr_auto_auto_auto]" method="POST" action="?/inspectReceipt" use:enhance>
							<input type="hidden" name="receiptId" value={receipt.id} />
							<input type="number" step="0.01" min="0" name="acceptedQuantity" value={receipt.quantityReceived} class="rounded-md border border-slate-300 px-2 py-1 text-[11px]" placeholder="Accept qty" />
							<input type="number" step="0.01" min="0" name="rejectedQuantity" class="rounded-md border border-slate-300 px-2 py-1 text-[11px]" placeholder="Reject qty" />
							<input name="reason" class="rounded-md border border-slate-300 px-2 py-1 text-[11px]" placeholder="Reason / return note" />
							<button name="decision" value="accept" class="rounded-md bg-green-700 px-2 py-1 text-[11px] font-medium text-white" type="submit">Accept</button>
							<button name="decision" value="quarantine" class="rounded-md bg-purple-700 px-2 py-1 text-[11px] font-medium text-white" type="submit">Quarantine</button>
							<button name="decision" value="reject" class="rounded-md bg-red-700 px-2 py-1 text-[11px] font-medium text-white" type="submit">Reject</button>
							<label class="flex items-center gap-1 text-[10px] text-slate-600 sm:col-span-6">
								<input type="checkbox" name="returnRequired" /> mark for return-to-supplier
							</label>
						</form>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if po.receipts && po.receipts.length > 0}
		<section class="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<h2 class="text-base font-semibold text-slate-900">Goods receipt history ({po.receipts.length})</h2>
			<div class="mt-3 space-y-2">
				{#each po.receipts as receipt}
					<div class="rounded-md border border-slate-200 bg-white p-3 text-xs">
						<div class="flex items-start justify-between gap-2">
							<div>
								<p class="font-semibold text-slate-800">{receipt.receiptNumber} · {receipt.receiptDate}</p>
								<p class="text-[11px] text-slate-500">qty {receipt.quantityReceived} · acc {receipt.acceptedQuantity} · rej {receipt.rejectedQuantity} · back-order {receipt.backOrderQuantity}</p>
							</div>
							<div class="flex flex-wrap justify-end gap-1">
								<span class="rounded-full bg-slate-100 px-2 py-0.5 font-medium capitalize text-slate-700">{(receipt.status ?? 'accepted').replace('_', ' ')}</span>
								{#if receipt.inspectionStatus && receipt.inspectionStatus !== 'not_required'}
									<span class={
										receipt.inspectionStatus === 'accepted'
											? 'rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-800'
											: receipt.inspectionStatus === 'rejected'
												? 'rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700'
												: receipt.inspectionStatus === 'quarantined'
													? 'rounded-full bg-purple-100 px-2 py-0.5 font-medium text-purple-700'
													: 'rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800'
									}>QC: {receipt.inspectionStatus}</span>
								{/if}
								{#if receipt.overReceiptFlag}<span class="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">over-receipt</span>{/if}
								{#if receipt.paymentTriggeredAt}<span class="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">Pay {receipt.paymentReference ?? ''}</span>{/if}
								{#if receipt.returnRequired}<span class="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">return</span>{/if}
							</div>
						</div>
						{#if receipt.rejectionReason}<p class="mt-1 text-[11px] text-red-700">Reject reason: {receipt.rejectionReason}</p>{/if}
					</div>
				{/each}
			</div>
		</section>
	{/if}
</PageShell>
