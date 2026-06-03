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
		value === null || value === undefined ? '-' : `${Number(value).toFixed(1)}`;
</script>

<PageShell
	eyebrow="Procurement · RFQ"
	title={data.comparison.rfq.rfqNumber}
	description={data.comparison.rfq.title}
>
	<ProcurementSubNav />

	{#if form?.error}
		<div class="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
			{form.error}
		</div>
	{/if}

	<div class="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
		<a href="/procurement/rfqs" class="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
			← Back to RFQ list
		</a>
		<span>Status: <span class="rounded-full bg-slate-100 px-2 py-0.5 capitalize text-slate-700">{data.comparison.rfq.status}</span></span>
		<span>Currency: {data.comparison.rfq.currency}</span>
		<span>Required by: {data.comparison.rfq.requiredByDate ?? '—'}</span>
		{#if data.comparison.purchaseOrder}
			<a
				href={`/procurement/purchase-orders/${data.comparison.purchaseOrder.id}`}
				class="rounded-full bg-green-100 px-2 py-0.5 font-semibold text-green-800 hover:bg-green-200"
			>
				PO created · {data.comparison.purchaseOrder.poNumber}
			</a>
		{/if}
	</div>

	<section class="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
		<div class="border-b border-slate-200 px-4 py-3">
			<h2 class="text-base font-semibold text-slate-900">RFQ items requested</h2>
			<p class="text-xs text-slate-500">
				What suppliers are quoting against. Use the "Submit quotation" form on the right to record their numbers.
			</p>
		</div>
		<table class="min-w-full divide-y divide-slate-100 text-sm">
			<thead class="bg-slate-50 text-xs uppercase text-slate-500">
				<tr>
					<th class="px-3 py-2 text-left">Code</th>
					<th class="px-3 py-2 text-left">Description</th>
					<th class="px-3 py-2 text-right">Qty</th>
					<th class="px-3 py-2 text-left">UOM</th>
					<th class="px-3 py-2 text-right">Target unit price</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#each data.comparison.items as item}
					<tr>
						<td class="px-3 py-2 font-mono text-xs">{item.itemCode ?? '—'}</td>
						<td class="px-3 py-2">{item.description}</td>
						<td class="px-3 py-2 text-right">{item.quantity}</td>
						<td class="px-3 py-2">{item.uom}</td>
						<td class="px-3 py-2 text-right">{money(item.targetUnitPrice, data.comparison.rfq.currency)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section class="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
		<div class="border-b border-slate-200 px-4 py-3">
			<h2 class="text-base font-semibold text-slate-900">Invited suppliers ({data.comparison.invitations.length})</h2>
		</div>
		<table class="min-w-full divide-y divide-slate-100 text-sm">
			<thead class="bg-slate-50 text-xs uppercase text-slate-500">
				<tr>
					<th class="px-3 py-2 text-left">Supplier</th>
					<th class="px-3 py-2 text-left">Status</th>
					<th class="px-3 py-2 text-left">Quotes received</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#each data.comparison.invitations as inv}
					<tr>
						<td class="px-3 py-2 font-medium text-slate-900">{inv.supplier?.name ?? inv.supplierId}</td>
						<td class="px-3 py-2">
							<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-700">
								{inv.status.replace('_', ' ')}
							</span>
						</td>
						<td class="px-3 py-2 text-slate-600">{inv.quotations.length}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section class="rounded-xl border border-slate-200 bg-white shadow-sm">
		<div class="border-b border-slate-200 px-4 py-3">
			<h2 class="text-base font-semibold text-slate-900">Quotation comparison</h2>
			<p class="text-xs text-slate-500">
				Pick the winning quotation to auto-create a Purchase Order. Once a PO exists, further wins are disabled.
			</p>
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
							<tr>
								<td colspan="7" class="px-3 py-8 text-center text-slate-500">
									No supplier quotations submitted yet.
								</td>
							</tr>
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
											base {money(quote.totalCostAnalysis.subtotal, quote.currency)} · ship
											{money(quote.totalCostAnalysis.shipping, quote.currency)} · tax
											{money(quote.totalCostAnalysis.tax, quote.currency)} · duties
											{money(quote.totalCostAnalysis.duties, quote.currency)}
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
											<span class="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
												Selected
											</span>
										{:else if !data.comparison.purchaseOrder}
											<form class="space-y-2" method="POST" action="?/selectWinner" use:enhance>
												<input type="hidden" name="quotationId" value={quote.id} />
												<input name="poNumber" class="w-full rounded border border-slate-300 px-2 py-1 text-xs" placeholder="PO no. auto" />
												<input type="date" name="poDate" class="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
												<input type="date" name="deliveryDate" class="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
												<select name="taxCode" class="w-full rounded border border-slate-300 px-2 py-1 text-xs">
													<option value="SR">SR</option>
													<option value="ZR">ZR</option>
													<option value="ES">ES</option>
													<option value="OP">OP</option>
												</select>
												<input name="incoterms" class="w-full rounded border border-slate-300 px-2 py-1 text-xs" placeholder="Incoterms" />
												<input name="billingAddress" class="w-full rounded border border-slate-300 px-2 py-1 text-xs" placeholder="Billing address" />
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
</PageShell>
