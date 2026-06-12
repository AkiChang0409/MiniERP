<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { CATEGORY_LABELS } from '$modules/finance/domain/expense-upload';

	let { data } = $props();

	const money = (value: number, currency = 'SGD') =>
		new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(value ?? 0);

	const categoryLabel = (c: string) =>
		(CATEGORY_LABELS as Record<string, string>)[c] ?? c;
</script>

<PageShell
	eyebrow="Finance"
	title="Reimbursement Records"
	description="Staff out-of-pocket expenses flagged for reimbursement (reimbursement = true). No approval workflow in this build."
>
	<!-- Summary -->
	<div class="grid grid-cols-2 gap-4 md:grid-cols-2">
		<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Total Reimbursement</p>
			<p class="mt-1 text-xl font-semibold text-slate-900">{money(data.total)}</p>
			<p class="mt-0.5 text-xs text-slate-500">{data.reimbursements.length} record(s)</p>
		</div>
		<div class="flex items-center justify-end">
			<a
				href="/finance/expenses"
				class="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
			>
				Back to Expenses
			</a>
		</div>
	</div>

	<!-- Table -->
	<div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-slate-200 text-sm">
			<thead class="bg-slate-50 text-left text-slate-600">
				<tr>
					<th class="px-4 py-3 font-medium">Date</th>
					<th class="px-4 py-3 font-medium">Staff</th>
					<th class="px-4 py-3 font-medium">Category</th>
					<th class="px-4 py-3 font-medium">Vendor</th>
					<th class="px-4 py-3 font-medium text-right">Amount</th>
					<th class="px-4 py-3 font-medium">Notes</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#if data.reimbursements.length === 0}
					<tr>
						<td class="px-4 py-8 text-center text-slate-500" colspan="6">
							No reimbursement records found.
						</td>
					</tr>
				{:else}
					{#each data.reimbursements as item}
						<tr class="hover:bg-slate-50">
							<td class="px-4 py-3 text-slate-600">{item.date}</td>
							<td class="px-4 py-3 font-medium text-slate-800">{item.staffName || '-'}</td>
							<td class="px-4 py-3 text-slate-600">{categoryLabel(item.category)}</td>
							<td class="px-4 py-3 text-slate-600">{item.vendorOrSupplier || '-'}</td>
							<td class="px-4 py-3 text-right font-medium text-slate-800">
								{money(item.amount, item.currency)}
								{#if item.currency !== 'SGD' && item.sgdEquivalent}
									<span class="block text-xs text-slate-500">{money(item.sgdEquivalent)}</span>
								{/if}
							</td>
							<td class="px-4 py-3 max-w-[200px] truncate text-slate-500 text-xs">
								{item.notes || '-'}
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</PageShell>


