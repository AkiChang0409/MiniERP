<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import ProcurementSubNav from '$app-layer/components/procurement/ProcurementSubNav.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const money = (value: number | null | undefined, currency = 'SGD') =>
		value === null || value === undefined
			? '-'
			: new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(Number(value));

	const pct = (value: number | null | undefined) =>
		value === null || value === undefined ? '-' : `${Number(value).toFixed(1)}%`;

	const matchChip: Record<string, { label: string; tone: string }> = {
		unmatched: { label: 'Unmatched', tone: 'bg-gray-100 text-gray-700' },
		matched: { label: 'Matched', tone: 'bg-green-100 text-green-800' },
		qty_mismatch: { label: 'Qty mismatch', tone: 'bg-amber-100 text-amber-800' },
		over_invoiced: { label: 'Over-invoiced', tone: 'bg-amber-100 text-amber-800' },
		price_variance: { label: 'Price variance', tone: 'bg-orange-100 text-orange-800' },
		missing_grn: { label: 'No GRN yet', tone: 'bg-yellow-100 text-yellow-800' },
		no_po: { label: 'No PO link', tone: 'bg-red-100 text-red-800' }
	};

	const statusChip: Record<string, { label: string; tone: string }> = {
		draft: { label: 'Draft', tone: 'bg-gray-100 text-gray-700' },
		pending_match: { label: 'Pending review', tone: 'bg-yellow-100 text-yellow-800' },
		matched: { label: 'Matched', tone: 'bg-green-100 text-green-800' },
		partial_match: { label: 'Partial match', tone: 'bg-amber-100 text-amber-800' },
		disputed: { label: 'Disputed', tone: 'bg-red-100 text-red-800' },
		approved: { label: 'Approved', tone: 'bg-blue-100 text-blue-800' },
		rejected: { label: 'Rejected', tone: 'bg-red-100 text-red-800' },
		paid: { label: 'Paid', tone: 'bg-emerald-100 text-emerald-800' },
		cancelled: { label: 'Cancelled', tone: 'bg-gray-100 text-gray-500' }
	};

	const approvalChip: Record<string, { label: string; tone: string }> = {
		pending_review: { label: 'Pending review', tone: 'bg-yellow-100 text-yellow-800' },
		auto_approved: { label: 'Auto-approved', tone: 'bg-green-100 text-green-800' },
		approved: { label: 'Approved', tone: 'bg-blue-100 text-blue-800' },
		rejected: { label: 'Rejected', tone: 'bg-red-100 text-red-800' }
	};

	// Create-form local state
	let supplierId = $state('');
	let poId = $state('');
	let nextRowId = 2;
	type LineRow = {
		id: number;
		poItemId: string;
		description: string;
		itemCode: string;
		quantity: number;
		unitPrice: number;
		taxCode: 'SR' | 'ZR' | 'ES' | 'OP' | '';
		notes: string;
	};
	let lineRows = $state<LineRow[]>([
		{
			id: 1,
			poItemId: '',
			description: '',
			itemCode: '',
			quantity: 1,
			unitPrice: 0,
			taxCode: 'SR',
			notes: ''
		}
	]);

	// PO list filtered by supplier — picking a PO autofills lines from PO items.
	const posForSupplier = $derived(
		data.purchaseOrders.filter((po) => !supplierId || po.supplierId === supplierId)
	);
	const selectedPo = $derived(data.purchaseOrders.find((p) => p.id === poId) ?? null);

	function addRow() {
		nextRowId += 1;
		lineRows = [
			...lineRows,
			{
				id: nextRowId,
				poItemId: '',
				description: '',
				itemCode: '',
				quantity: 1,
				unitPrice: 0,
				taxCode: 'SR',
				notes: ''
			}
		];
	}

	function removeRow(id: number) {
		if (lineRows.length <= 1) return;
		lineRows = lineRows.filter((r) => r.id !== id);
	}

	function fillFromPo() {
		if (!selectedPo) return;
		// One row per outstanding PO item — preload qty as the unbilled
		// received qty so a clean match drops out on first try.
		nextRowId = selectedPo.items.length;
		lineRows = selectedPo.items.map((item, idx) => ({
			id: idx + 1,
			poItemId: item.id,
			description: item.description ?? '',
			itemCode: item.itemCode ?? '',
			quantity: Number(item.receivedQuantity ?? item.quantity ?? 1),
			unitPrice: Number(item.unitPrice ?? 0),
			taxCode: (item.taxCode ?? 'SR') as 'SR' | 'ZR' | 'ES' | 'OP',
			notes: ''
		}));
	}

	function poItemLabel(itemId: string | null | undefined) {
		if (!itemId) return null;
		for (const po of data.purchaseOrders) {
			const found = po.items.find((it) => it.id === itemId);
			if (found) return `${po.poNumber} — ${found.itemCode ?? found.description}`;
		}
		return null;
	}
</script>

<PageShell
	eyebrow="Procurement"
	title="Supplier invoices"
	description="3-way matching (Invoice vs PO vs GRN). Clean matches auto-approve for AP; mismatches and IA004 alerts route to review."
>
	<ProcurementSubNav />

	{#if form?.error}
		<div class="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{form.error}</div>
	{/if}

	<section class="rounded-lg border border-gray-200 bg-white">
		<header class="border-b border-gray-200 px-4 py-3">
			<h2 class="text-base font-semibold">Record supplier invoice</h2>
			<p class="text-xs text-gray-500">
				Pick a PO to auto-fill received lines. Match runs immediately on save.
			</p>
		</header>
		<form
			method="post"
			action="?/createInvoice"
			use:enhance
			class="grid gap-4 p-4 lg:grid-cols-2"
		>
			<label class="text-sm">
				<span class="mb-1 block font-medium">Supplier invoice number *</span>
				<input
					name="invoiceNumber"
					required
					placeholder="e.g. SUP-2026-0042"
					class="w-full rounded border border-gray-300 px-2 py-1.5"
				/>
			</label>
			<label class="text-sm">
				<span class="mb-1 block font-medium">Invoice date</span>
				<input
					type="date"
					name="invoiceDate"
					class="w-full rounded border border-gray-300 px-2 py-1.5"
				/>
			</label>
			<label class="text-sm">
				<span class="mb-1 block font-medium">Supplier</span>
				<select
					name="supplierId"
					bind:value={supplierId}
					class="w-full rounded border border-gray-300 px-2 py-1.5"
				>
					<option value="">— Choose supplier —</option>
					{#each data.suppliers as supplier}
						<option value={supplier.id}>{supplier.name}</option>
					{/each}
				</select>
			</label>
			<label class="text-sm">
				<span class="mb-1 block font-medium">Purchase order</span>
				<div class="flex gap-2">
					<select
						name="poId"
						bind:value={poId}
						class="w-full rounded border border-gray-300 px-2 py-1.5"
					>
						<option value="">— Pick PO —</option>
						{#each posForSupplier as po}
							<option value={po.id}>
								{po.poNumber} · {money(po.totalAmount, po.currency)} · {po.status}
							</option>
						{/each}
					</select>
					<button
						type="button"
						onclick={fillFromPo}
						disabled={!selectedPo}
						class="rounded border border-gray-300 px-2 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-40"
					>
						Fill from PO
					</button>
				</div>
			</label>
			<label class="text-sm">
				<span class="mb-1 block font-medium">Due date</span>
				<input
					type="date"
					name="dueDate"
					class="w-full rounded border border-gray-300 px-2 py-1.5"
				/>
			</label>
			<label class="text-sm">
				<span class="mb-1 block font-medium">Currency</span>
				<input
					name="currency"
					value="SGD"
					class="w-full rounded border border-gray-300 px-2 py-1.5"
				/>
			</label>

			<div class="lg:col-span-2">
				<div class="mb-2 flex items-center justify-between">
					<h3 class="text-sm font-semibold">Invoice lines</h3>
					<button
						type="button"
						onclick={addRow}
						class="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
					>
						+ Add line
					</button>
				</div>
				<div class="overflow-x-auto rounded border border-gray-200">
					<table class="w-full text-xs">
						<thead class="bg-gray-50 text-gray-600">
							<tr>
								<th class="px-2 py-1 text-left">PO line</th>
								<th class="px-2 py-1 text-left">Item code</th>
								<th class="px-2 py-1 text-left">Description</th>
								<th class="px-2 py-1 text-right">Qty</th>
								<th class="px-2 py-1 text-right">Unit price</th>
								<th class="px-2 py-1 text-left">Tax</th>
								<th class="px-2 py-1"></th>
							</tr>
						</thead>
						<tbody>
							{#each lineRows as row (row.id)}
								<tr class="border-t border-gray-100">
									<td class="px-2 py-1">
										<select
											name="lineItemPoItemId"
											bind:value={row.poItemId}
											class="w-44 rounded border border-gray-300 px-1.5 py-1"
										>
											<option value="">— No PO link —</option>
											{#if selectedPo}
												{#each selectedPo.items as item}
													<option value={item.id}>
														{item.itemCode ?? item.description} · ordered {item.quantity}
													</option>
												{/each}
											{/if}
										</select>
									</td>
									<td class="px-2 py-1">
										<input
											name="lineItemCode"
											bind:value={row.itemCode}
											class="w-24 rounded border border-gray-300 px-1.5 py-1"
										/>
									</td>
									<td class="px-2 py-1">
										<input
											name="lineItemDescription"
											bind:value={row.description}
											class="w-full rounded border border-gray-300 px-1.5 py-1"
										/>
									</td>
									<td class="px-2 py-1 text-right">
										<input
											name="lineItemQuantity"
											type="number"
											min="0"
											step="0.001"
											bind:value={row.quantity}
											class="w-20 rounded border border-gray-300 px-1.5 py-1 text-right"
										/>
									</td>
									<td class="px-2 py-1 text-right">
										<input
											name="lineItemUnitPrice"
											type="number"
											min="0"
											step="0.0001"
											bind:value={row.unitPrice}
											class="w-24 rounded border border-gray-300 px-1.5 py-1 text-right"
										/>
									</td>
									<td class="px-2 py-1">
										<select
											name="lineItemTaxCode"
											bind:value={row.taxCode}
											class="w-16 rounded border border-gray-300 px-1.5 py-1"
										>
											<option value="">—</option>
											<option value="SR">SR</option>
											<option value="ZR">ZR</option>
											<option value="ES">ES</option>
											<option value="OP">OP</option>
										</select>
									</td>
									<td class="px-2 py-1 text-right">
										<button
											type="button"
											onclick={() => removeRow(row.id)}
											class="text-red-600 hover:underline"
										>
											remove
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

			<div class="lg:col-span-2 flex flex-wrap gap-3">
				<label class="text-xs">
					<span class="mb-1 block font-medium">Shipping</span>
					<input
						name="shippingAmount"
						type="number"
						min="0"
						step="0.01"
						value="0"
						class="w-24 rounded border border-gray-300 px-2 py-1"
					/>
				</label>
				<label class="text-xs">
					<span class="mb-1 block font-medium">Tax</span>
					<input
						name="taxAmount"
						type="number"
						min="0"
						step="0.01"
						value="0"
						class="w-24 rounded border border-gray-300 px-2 py-1"
					/>
				</label>
				<label class="text-xs">
					<span class="mb-1 block font-medium">Duties</span>
					<input
						name="dutiesAmount"
						type="number"
						min="0"
						step="0.01"
						value="0"
						class="w-24 rounded border border-gray-300 px-2 py-1"
					/>
				</label>
				<label class="text-xs">
					<span class="mb-1 block font-medium">Discount</span>
					<input
						name="discountAmount"
						type="number"
						min="0"
						step="0.01"
						value="0"
						class="w-24 rounded border border-gray-300 px-2 py-1"
					/>
				</label>
				<label class="flex-1 text-xs">
					<span class="mb-1 block font-medium">Notes</span>
					<input name="notes" class="w-full rounded border border-gray-300 px-2 py-1" />
				</label>
			</div>

			<div class="lg:col-span-2 flex justify-end">
				<button
					type="submit"
					class="rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
				>
					Save + run match
				</button>
			</div>
		</form>
	</section>

	<section class="rounded-lg border border-gray-200 bg-white">
		<header class="border-b border-gray-200 px-4 py-3">
			<h2 class="text-base font-semibold">Invoices ({data.invoices.length})</h2>
		</header>
		{#if data.invoices.length === 0}
			<p class="px-4 py-6 text-sm text-gray-500">
				No supplier invoices yet. Record one above to start the 3-way match.
			</p>
		{:else}
			<table class="w-full text-sm">
				<thead class="bg-gray-50 text-xs uppercase text-gray-600">
					<tr>
						<th class="px-3 py-2 text-left">Reference</th>
						<th class="px-3 py-2 text-left">Supplier · invoice #</th>
						<th class="px-3 py-2 text-left">PO</th>
						<th class="px-3 py-2 text-right">Total</th>
						<th class="px-3 py-2 text-left">Match</th>
						<th class="px-3 py-2 text-left">Approval</th>
						<th class="px-3 py-2 text-left">IA</th>
						<th class="px-3 py-2 text-left">AP ref</th>
						<th class="px-3 py-2"></th>
					</tr>
				</thead>
				<tbody>
					{#each data.invoices as inv}
						{@const matchStyle = matchChip[inv.matchStatus] ?? matchChip.unmatched}
						{@const statusStyle = statusChip[inv.status] ?? statusChip.draft}
						{@const approvalStyle = approvalChip[inv.approvalStatus] ?? approvalChip.pending_review}
						{@const poNumber = data.purchaseOrders.find((p) => p.id === inv.poId)?.poNumber}
						<tr class="border-t border-gray-100 hover:bg-gray-50">
							<td class="px-3 py-2 font-mono text-xs">{inv.invoiceReference}</td>
							<td class="px-3 py-2">
								<div class="font-medium">{inv.supplier?.name ?? '—'}</div>
								<div class="text-xs text-gray-500">{inv.invoiceNumber}</div>
							</td>
							<td class="px-3 py-2 text-xs text-gray-600">{poNumber ?? '—'}</td>
							<td class="px-3 py-2 text-right">{money(inv.totalAmount, inv.currency)}</td>
							<td class="px-3 py-2">
								<span class="inline-block rounded px-2 py-0.5 text-xs {matchStyle.tone}">
									{matchStyle.label}
								</span>
								{#if inv.maxPriceVariancePct !== null}
									<div class="text-xs text-gray-500">max Δ {pct(inv.maxPriceVariancePct)}</div>
								{/if}
							</td>
							<td class="px-3 py-2">
								<span class="inline-block rounded px-2 py-0.5 text-xs {approvalStyle.tone}">
									{approvalStyle.label}
								</span>
								<div class="mt-0.5">
									<span class="inline-block rounded px-2 py-0.5 text-xs {statusStyle.tone}">
										{statusStyle.label}
									</span>
								</div>
							</td>
							<td class="px-3 py-2">
								{#if inv.iaExceptionCode}
									<span class="inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
										{inv.iaExceptionCode}
									</span>
								{:else}
									<span class="text-xs text-gray-400">—</span>
								{/if}
							</td>
							<td class="px-3 py-2 font-mono text-xs">{inv.paymentReference ?? '—'}</td>
							<td class="px-3 py-2 text-right">
								<a
									href={`/procurement/supplier-invoices?invoice=${inv.id}`}
									class="text-xs text-blue-600 hover:underline"
								>
									view
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	{#if data.selectedInvoice}
		{@const detail = data.selectedInvoice}
		{@const matchStyle = matchChip[detail.invoice.matchStatus] ?? matchChip.unmatched}
		{@const statusStyle = statusChip[detail.invoice.status] ?? statusChip.draft}
		{@const approvalStyle = approvalChip[detail.invoice.approvalStatus] ?? approvalChip.pending_review}
		<section class="rounded-lg border border-gray-200 bg-white">
			<header class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
				<div>
					<h2 class="text-base font-semibold">
						{detail.invoice.invoiceReference} · {detail.invoice.invoiceNumber}
					</h2>
					<p class="text-xs text-gray-500">
						{detail.supplier?.name ?? 'Supplier not set'} ·
						{detail.purchaseOrder?.poNumber ?? 'No PO'} · invoice date {detail.invoice.invoiceDate}
					</p>
				</div>
				<div class="flex flex-wrap gap-2">
					<span class="inline-block rounded px-2 py-0.5 text-xs {matchStyle.tone}">
						match: {matchStyle.label}
					</span>
					<span class="inline-block rounded px-2 py-0.5 text-xs {statusStyle.tone}">
						{statusStyle.label}
					</span>
					<span class="inline-block rounded px-2 py-0.5 text-xs {approvalStyle.tone}">
						{approvalStyle.label}
					</span>
					{#if detail.invoice.iaExceptionCode}
						<span
							class="inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800"
							title={detail.invoice.iaExceptionReason ?? ''}
						>
							{detail.invoice.iaExceptionCode}
						</span>
					{/if}
				</div>
			</header>

			<div class="space-y-4 p-4">
				<div class="overflow-x-auto rounded border border-gray-200">
					<table class="w-full text-xs">
						<thead class="bg-gray-50 text-gray-600">
							<tr>
								<th class="px-2 py-1 text-left">Description</th>
								<th class="px-2 py-1 text-left">PO line</th>
								<th class="px-2 py-1 text-right">Inv qty</th>
								<th class="px-2 py-1 text-right">Inv price</th>
								<th class="px-2 py-1 text-right">PO price</th>
								<th class="px-2 py-1 text-right">Received</th>
								<th class="px-2 py-1 text-right">Δ price</th>
								<th class="px-2 py-1 text-right">Δ qty</th>
								<th class="px-2 py-1 text-left">Line match</th>
							</tr>
						</thead>
						<tbody>
							{#each detail.lines as line}
								{@const lineStyle = matchChip[line.lineMatchStatus] ?? matchChip.unmatched}
								<tr class="border-t border-gray-100">
									<td class="px-2 py-1">
										<div class="font-medium">{line.description}</div>
										{#if line.itemCode}
											<div class="text-gray-500">{line.itemCode}</div>
										{/if}
									</td>
									<td class="px-2 py-1 text-gray-500">{poItemLabel(line.poItemId) ?? '—'}</td>
									<td class="px-2 py-1 text-right">{Number(line.quantityInvoiced).toFixed(2)}</td>
									<td class="px-2 py-1 text-right">{money(line.unitPriceInvoiced, detail.invoice.currency)}</td>
									<td class="px-2 py-1 text-right">
										{line.poUnitPrice === null ? '—' : money(line.poUnitPrice, detail.invoice.currency)}
									</td>
									<td class="px-2 py-1 text-right">{Number(line.quantityReceivedMatched).toFixed(2)}</td>
									<td class="px-2 py-1 text-right">{pct(line.priceVariancePct)}</td>
									<td class="px-2 py-1 text-right">
										{line.qtyVariance === null ? '—' : Number(line.qtyVariance).toFixed(2)}
									</td>
									<td class="px-2 py-1">
										<span class="inline-block rounded px-2 py-0.5 {lineStyle.tone}">
											{lineStyle.label}
										</span>
										{#if line.iaExceptionCode}
											<span class="ml-1 inline-block rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-800">
												{line.iaExceptionCode}
											</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<div class="grid gap-3 lg:grid-cols-2">
					<form method="post" action="?/rematchInvoice" use:enhance class="rounded border border-gray-200 p-3">
						<h3 class="mb-2 text-sm font-semibold">Re-run match</h3>
						<p class="mb-2 text-xs text-gray-500">
							Recomputes line verdicts against the latest PO + GRN snapshot. Useful after a new
							GRN posts.
						</p>
						<input type="hidden" name="invoiceId" value={detail.invoice.id} />
						<button class="rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50">
							Re-match
						</button>
					</form>

					{#if detail.invoice.status === 'matched' || detail.invoice.status === 'approved' || detail.invoice.status === 'paid'}
						<div class="rounded border border-gray-200 p-3 text-xs">
							<h3 class="mb-2 text-sm font-semibold">Payment</h3>
							{#if detail.invoice.paymentReference}
								<p>
									AP ref:
									<span class="font-mono">{detail.invoice.paymentReference}</span>
									(triggered {detail.invoice.paymentTriggeredAt?.slice(0, 16).replace('T', ' ')})
								</p>
							{:else}
								<p>Awaiting payment trigger.</p>
							{/if}
						</div>
					{:else}
						<form
							method="post"
							action="?/decideInvoice"
							use:enhance
							class="rounded border border-gray-200 p-3"
						>
							<h3 class="mb-2 text-sm font-semibold">Reviewer decision</h3>
							<input type="hidden" name="invoiceId" value={detail.invoice.id} />
							<label class="block text-xs">
								<span class="mb-1 block font-medium">Action</span>
								<select name="action" class="w-full rounded border border-gray-300 px-2 py-1">
									<option value="approve">Approve (matched only)</option>
									<option value="override_approve">Override approve (variance accepted)</option>
									<option value="reject">Reject invoice</option>
								</select>
							</label>
							<label class="mt-2 block text-xs">
								<span class="mb-1 block font-medium">Reason / note</span>
								<textarea
									name="reason"
									rows="2"
									class="w-full rounded border border-gray-300 px-2 py-1"
									placeholder="Required for override / reject"
								></textarea>
							</label>
							<button
								class="mt-2 rounded bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800"
							>
								Submit decision
							</button>
						</form>
					{/if}
				</div>
			</div>
		</section>
	{/if}
</PageShell>
