<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import SalesSubNav from '$app-layer/components/sales-crm/SalesSubNav.svelte';

	let { data } = $props();

	const statusStyle: Record<string, string> = {
		draft: 'bg-slate-100 text-slate-600',
		sent: 'bg-sky-100 text-sky-700',
		accepted: 'bg-emerald-100 text-emerald-700',
		rejected: 'bg-red-100 text-red-700',
		expired: 'bg-amber-100 text-amber-700',
		converted: 'bg-green-100 text-green-800'
	};
</script>

<PageShell eyebrow="Sales & CRM" title="Quotations" description="Customer quotes — convert accepted quotes to sales orders in one click.">
	<SalesSubNav />

	<div class="mb-4">
		<a class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" href="/sales-crm/quotations/new">New quotation</a>
	</div>

	<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-slate-200 text-sm">
			<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
				<tr><th class="px-4 py-3">Quote #</th><th class="px-4 py-3">Customer</th><th class="px-4 py-3">Status</th><th class="px-4 py-3">Total</th><th class="px-4 py-3">Date</th></tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#if data.quotations.length === 0}
					<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500">No quotations yet.</td></tr>
				{:else}
					{#each data.quotations as q}
						<tr class="hover:bg-slate-50/80">
							<td class="px-4 py-3 font-medium"><a class="text-slate-900 hover:text-[var(--sf-green)] hover:underline" href="/sales-crm/quotations/{q.id}">{q.quoteNumber}</a></td>
							<td class="px-4 py-3 text-slate-600">{q.customerName}</td>
							<td class="px-4 py-3"><span class="rounded-full px-2 py-0.5 text-xs {statusStyle[q.status] ?? 'bg-slate-100 text-slate-600'}">{q.status}</span></td>
							<td class="px-4 py-3 text-slate-700">{q.currency} {q.totalAmount}</td>
							<td class="px-4 py-3 text-slate-500">{q.quoteDate}</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</PageShell>
