<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import SalesSubNav from '$app-layer/components/sales-crm/SalesSubNav.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const order = $derived(data.order);
	const steps = ['draft', 'confirmed', 'picking', 'packed', 'shipped', 'invoiced'];
	const currentStep = $derived(steps.indexOf(order.status));
	const inputClass =
		'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]';
</script>

<PageShell eyebrow="Sales & CRM" title={order.orderNumber} description="Sales order fulfilment.">
	<SalesSubNav />

	{#if form?.error}
		<p class="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{form.error}</p>
	{/if}

	<!-- Status stepper -->
	<div class="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
		{#each steps as s, i}
			<span class={i <= currentStep && order.status !== 'cancelled'
				? 'rounded-full bg-[var(--sf-green)] px-3 py-1 text-xs font-medium text-white'
				: 'rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500'}>{s}</span>
			{#if i < steps.length - 1}<span class="text-slate-300">→</span>{/if}
		{/each}
		{#if order.status === 'cancelled'}<span class="ml-2 rounded-full bg-red-100 px-3 py-1 text-xs text-red-700">cancelled</span>{/if}
	</div>

	<div class="grid gap-4 lg:grid-cols-3">
		<!-- Summary -->
		<div class="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
			<div class="grid grid-cols-2 gap-3 text-sm">
				<div><span class="text-slate-500">Customer</span><div class="font-medium">{data.customer?.name ?? order.customerId}</div></div>
				<div><span class="text-slate-500">Source</span><div class="font-medium">{order.sourceType}</div></div>
				<div><span class="text-slate-500">Order date</span><div>{order.orderDate}</div></div>
				<div><span class="text-slate-500">Requested delivery</span><div>{order.requestedDeliveryDate ?? '—'}</div></div>
				<div><span class="text-slate-500">Subtotal</span><div>{order.currency} {order.subtotalAmount}</div></div>
				<div><span class="text-slate-500">Discount</span><div>{order.discountPct}% ({order.currency} {order.discountAmount})</div></div>
				<div><span class="text-slate-500">Tax</span><div>{order.currency} {order.taxAmount}</div></div>
				<div><span class="text-slate-500">Total</span><div class="font-semibold">{order.currency} {order.totalAmount}</div></div>
			</div>

			{#if order.iaExceptionCode}
				<div class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
					<span class="font-semibold">{order.iaExceptionCode}</span> — {order.iaExceptionReason}
				</div>
			{/if}
			{#if order.creditHoldFlag}
				<div class="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
					<span class="font-semibold">Credit hold.</span> {order.creditCheckMessage ?? ''} Shipments are blocked until released.
				</div>
			{/if}
		</div>

		<!-- Actions -->
		<div class="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
			<h3 class="text-sm font-semibold text-slate-800">Actions</h3>

			{#if order.approvalStatus === 'pending_approval'}
				<form method="POST" action="?/approve" use:enhance class="space-y-2">
					<p class="text-xs text-slate-500">Discount exceeds threshold — director approval required.</p>
					<input name="reason" placeholder="Reason (for rejection)" class={inputClass} />
					<div class="flex gap-2">
						<button name="action" value="approve" class="flex-1 rounded-md bg-[var(--sf-green)] px-3 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]">Approve</button>
						<button name="action" value="reject" class="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">Reject</button>
					</div>
				</form>
			{/if}

			{#if order.status === 'draft' && order.approvalStatus !== 'pending_approval' && order.approvalStatus !== 'rejected'}
				<form method="POST" action="?/confirm" use:enhance class="space-y-2">
					<label class="block text-xs text-slate-500">Confirmed delivery date
						<input name="confirmedDeliveryDate" type="date" class={inputClass} /></label>
					<button class="w-full rounded-md bg-[var(--sf-green)] px-3 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]">Confirm + check ATP / reserve</button>
				</form>
			{/if}

			{#if order.status === 'confirmed'}
				<form method="POST" action="?/pick" use:enhance>
					<button class="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700">Start picking</button>
				</form>
			{/if}
			{#if order.status === 'picking' || order.status === 'confirmed'}
				<form method="POST" action="?/pack" use:enhance>
					<button class="w-full rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700">Mark packed</button>
				</form>
			{/if}
			{#if order.status === 'shipped'}
				<form method="POST" action="?/invoice" use:enhance>
					<button class="w-full rounded-md bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-800">Generate invoice</button>
				</form>
			{/if}
			{#if order.status === 'invoiced'}
				<p class="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Invoiced. AR event emitted to finance.</p>
			{/if}
		</div>
	</div>

	<!-- Line items + shipping -->
	<form method="POST" action="?/ship" use:enhance class="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-slate-200 text-sm">
			<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
				<tr>
					<th class="px-4 py-3">Item</th>
					<th class="px-4 py-3">Qty</th>
					<th class="px-4 py-3">Reserved</th>
					<th class="px-4 py-3">Shipped</th>
					<th class="px-4 py-3">Back-order</th>
					<th class="px-4 py-3">ATP @ confirm</th>
					{#if ['confirmed', 'picking', 'packed', 'shipped'].includes(order.status) && !order.creditHoldFlag}
						<th class="px-4 py-3">Ship now</th>
					{/if}
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#each data.items as it}
					<tr>
						<td class="px-4 py-3"><div class="font-medium text-slate-900">{it.description}</div><div class="text-xs text-slate-400">{it.itemCode ?? ''}</div></td>
						<td class="px-4 py-3">{it.quantity} {it.uom}</td>
						<td class="px-4 py-3">{it.reservedQuantity}</td>
						<td class="px-4 py-3">{it.shippedQuantity}</td>
						<td class="px-4 py-3">{#if it.backOrderedQuantity > 0}<span class="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">{it.backOrderedQuantity}</span>{:else}0{/if}</td>
						<td class="px-4 py-3 text-slate-500">{it.atpAtConfirm ?? '—'}</td>
						{#if ['confirmed', 'picking', 'packed', 'shipped'].includes(order.status) && !order.creditHoldFlag}
							<td class="px-4 py-3">
								{#if it.shippedQuantity < it.quantity}
									<input name={`ship_${it.id}`} type="number" step="0.01" min="0" max={it.quantity - it.shippedQuantity} placeholder={String(it.quantity - it.shippedQuantity)} class="w-24 {inputClass}" />
								{:else}
									<span class="text-xs text-emerald-600">complete</span>
								{/if}
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
		{#if ['confirmed', 'picking', 'packed', 'shipped'].includes(order.status) && !order.creditHoldFlag}
			<div class="border-t border-slate-100 p-3">
				<button class="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Record shipment</button>
			</div>
		{/if}
	</form>

	{#if data.shipments.length > 0}
		<div class="mt-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
			<h3 class="mb-3 text-sm font-semibold text-slate-800">Shipment history</h3>
			<ul class="divide-y divide-slate-100 text-sm">
				{#each data.shipments as s}
					<li class="flex items-center justify-between py-2">
						<span class="text-slate-700">{s.shipmentNumber} · {s.shipmentDate}</span>
						<span class="text-slate-500">qty {s.quantityShipped}{#if s.backOrderQuantity > 0} · back-order {s.backOrderQuantity}{/if}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</PageShell>
