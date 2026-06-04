<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import SalesSubNav from '$app-layer/components/sales-crm/SalesSubNav.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const q = $derived(data.quotation);
</script>

<PageShell eyebrow="Sales & CRM" title={q.quoteNumber} description="Customer quotation.">
	<SalesSubNav />

	{#if form?.error}<p class="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{form.error}</p>{/if}

	<div class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
		<div class="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
			<div><span class="text-slate-500">Customer</span><div class="font-medium">{data.customer?.name ?? q.customerId}</div></div>
			<div><span class="text-slate-500">Status</span><div class="font-medium">{q.status}</div></div>
			<div><span class="text-slate-500">Total</span><div class="font-medium">{q.currency} {q.totalAmount}</div></div>
			<div><span class="text-slate-500">Valid until</span><div>{q.validUntil ?? '—'}</div></div>
		</div>
		{#if q.status !== 'converted'}
			<form method="POST" action="?/convert" use:enhance>
				<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]">Convert to sales order</button>
			</form>
		{:else}
			<a class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/sales-crm/orders/{q.convertedOrderId}">View order →</a>
		{/if}
	</div>

	<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-slate-200 text-sm">
			<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
				<tr><th class="px-4 py-3">Item</th><th class="px-4 py-3">Qty</th><th class="px-4 py-3">Unit price</th><th class="px-4 py-3">Disc %</th><th class="px-4 py-3">Subtotal</th></tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#each data.items as it}
					<tr>
						<td class="px-4 py-3"><div class="font-medium text-slate-900">{it.description}</div><div class="text-xs text-slate-400">{it.itemCode ?? ''}</div></td>
						<td class="px-4 py-3">{it.quantity} {it.uom}</td>
						<td class="px-4 py-3">{it.unitPrice}</td>
						<td class="px-4 py-3">{it.discountPct}</td>
						<td class="px-4 py-3">{it.lineSubtotal}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</PageShell>
