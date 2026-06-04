<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import SalesSubNav from '$app-layer/components/sales-crm/SalesSubNav.svelte';

	let { data } = $props();

	const statusStyle: Record<string, string> = {
		draft: 'bg-slate-100 text-slate-600',
		confirmed: 'bg-sky-100 text-sky-700',
		picking: 'bg-indigo-100 text-indigo-700',
		packed: 'bg-violet-100 text-violet-700',
		shipped: 'bg-emerald-100 text-emerald-700',
		invoiced: 'bg-green-100 text-green-800',
		cancelled: 'bg-red-100 text-red-700'
	};
</script>

<PageShell eyebrow="Sales & CRM" title="Sales Orders" description="Create, confirm, fulfil, and invoice customer orders.">
	<SalesSubNav />

	<div class="mb-4">
		<a class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" href="/sales-crm/orders/new">New sales order</a>
	</div>

	<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-slate-200 text-sm">
			<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
				<tr>
					<th class="px-4 py-3">Order #</th>
					<th class="px-4 py-3">Customer</th>
					<th class="px-4 py-3">Status</th>
					<th class="px-4 py-3">Total</th>
					<th class="px-4 py-3">Flags</th>
					<th class="px-4 py-3">Date</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#if data.orders.length === 0}
					<tr><td colspan="6" class="px-4 py-8 text-center text-slate-500">No sales orders yet.</td></tr>
				{:else}
					{#each data.orders as o}
						<tr class="hover:bg-slate-50/80">
							<td class="px-4 py-3 font-medium"><a class="text-slate-900 hover:text-[var(--sf-green)] hover:underline" href="/sales-crm/orders/{o.id}">{o.orderNumber}</a></td>
							<td class="px-4 py-3 text-slate-600">{o.customerName}</td>
							<td class="px-4 py-3"><span class="rounded-full px-2 py-0.5 text-xs {statusStyle[o.status] ?? 'bg-slate-100 text-slate-600'}">{o.status}</span></td>
							<td class="px-4 py-3 text-slate-700">{o.currency} {o.totalAmount}</td>
							<td class="px-4 py-3">
								{#if o.iaExceptionCode}<span class="mr-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{o.iaExceptionCode}</span>{/if}
								{#if o.approvalStatus === 'pending_approval'}<span class="mr-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">Awaiting approval</span>{/if}
								{#if o.creditHoldFlag}<span class="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Credit hold</span>{/if}
							</td>
							<td class="px-4 py-3 text-slate-500">{o.orderDate}</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</PageShell>
