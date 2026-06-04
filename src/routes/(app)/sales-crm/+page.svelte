<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import SalesSubNav from '$app-layer/components/sales-crm/SalesSubNav.svelte';

	let { data } = $props();
</script>

<PageShell eyebrow="Sales & CRM" title="Sales workspace" description="Customers, quotations, and sales order fulfilment.">
	<SalesSubNav />

	<div class="mb-5 grid gap-4 sm:grid-cols-3">
		<a href="/sales-crm/customers" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300">
			<div class="text-3xl font-semibold text-slate-900">{data.counts.customers}</div>
			<div class="text-sm text-slate-500">Customers</div>
		</a>
		<a href="/sales-crm/quotations" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300">
			<div class="text-3xl font-semibold text-slate-900">{data.counts.quotations}</div>
			<div class="text-sm text-slate-500">Quotations</div>
		</a>
		<a href="/sales-crm/orders" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300">
			<div class="text-3xl font-semibold text-slate-900">{data.counts.orders}</div>
			<div class="text-sm text-slate-500">Sales orders</div>
		</a>
	</div>

	{#if data.flags.ia002 || data.flags.creditHold || data.flags.pendingApproval}
		<div class="mb-5 flex flex-wrap gap-3">
			{#if data.flags.pendingApproval}<span class="rounded-full bg-orange-100 px-3 py-1 text-sm text-orange-700">{data.flags.pendingApproval} awaiting director approval</span>{/if}
			{#if data.flags.ia002}<span class="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800">{data.flags.ia002} IA002 revenue-risk flags</span>{/if}
			{#if data.flags.creditHold}<span class="rounded-full bg-red-100 px-3 py-1 text-sm text-red-700">{data.flags.creditHold} on credit hold</span>{/if}
		</div>
	{/if}

	<div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
		<h3 class="mb-3 text-sm font-semibold text-slate-800">Recent orders</h3>
		{#if data.recentOrders.length === 0}
			<p class="text-sm text-slate-500">No sales orders yet. <a class="text-[var(--sf-green)] hover:underline" href="/sales-crm/orders/new">Create one</a>.</p>
		{:else}
			<ul class="divide-y divide-slate-100 text-sm">
				{#each data.recentOrders as o}
					<li class="flex items-center justify-between py-2">
						<a class="font-medium text-slate-900 hover:text-[var(--sf-green)] hover:underline" href="/sales-crm/orders/{o.id}">{o.orderNumber}</a>
						<span class="text-slate-500">{o.customerName}</span>
						<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{o.status}</span>
						<span class="text-slate-700">{o.currency} {o.totalAmount}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</PageShell>
