<script lang="ts">
	import { enhance } from '$app/forms';
	import { REVENUE_INVOICE_TYPES } from '$modules/finance/domain/expense-upload';

	let { data } = $props();

	const money = (value: number | null, currency = 'SGD') =>
		value != null
			? new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(value)
			: '-';

	const formatDate = (date: string | null) => {
		if (!date) return '-';
		return new Date(date).toLocaleDateString('en-SG', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	};

	let showNewRevenue = $state(false);

	const invoiceTypeLabel = (t: string) => {
		switch (t) {
			case 'standard':
				return 'Standard';
			case 'zero_rate':
				return 'Zero Rate';
			case 'tax_invoice':
				return 'Tax Invoice (9% GST)';
			default:
				return t;
		}
	};

	const statusBadgeClass = (status: string | null) => {
		switch (status) {
			case 'paid':
				return 'bg-emerald-100 text-emerald-700';
			case 'sent':
				return 'bg-blue-100 text-blue-700';
			case 'draft':
				return 'bg-amber-100 text-amber-700';
			case 'overdue':
				return 'bg-red-100 text-red-700';
			default:
				return 'bg-slate-100 text-slate-600';
		}
	};
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-xl font-semibold text-slate-900">Revenue</h1>
		<p class="mt-1 text-sm text-slate-500">Track project revenue. Recording here means cash has been received.</p>
	</div>

	<!-- Summary cards -->
	<div class="grid gap-4 sm:grid-cols-3">
		<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Total Revenue</p>
			<p class="mt-1 text-xl font-semibold text-slate-900">{money(data.totals.total)}</p>
		</div>
		<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-emerald-600">Recorded Revenue</p>
			<p class="mt-1 text-xl font-semibold text-emerald-900">{money(data.totals.revenue)}</p>
			<p class="mt-0.5 text-xs text-emerald-600">{data.revenueRecords.length} record(s)</p>
		</div>
		<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Invoiced (AR)</p>
			<p class="mt-1 text-xl font-semibold text-slate-900">{money(data.totals.invoiced)}</p>
			<p class="mt-0.5 text-xs text-slate-500">{data.invoices.length} invoice(s)</p>
		</div>
	</div>

	<!-- Actions -->
	<div class="flex flex-wrap items-center gap-2">
		<button
			type="button"
			class="rounded-md bg-[var(--sf-green)] px-3 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]"
			onclick={() => (showNewRevenue = true)}
		>
			Record Revenue
		</button>
		<a
			class="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
			href="/finance/revenue"
		>
			All Revenue
		</a>
	</div>

	<!-- Revenue records table -->
	{#if data.revenueRecords.length > 0}
		<div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			<div class="border-b border-slate-200 px-5 py-3">
				<h3 class="text-sm font-medium text-slate-900">Revenue Records</h3>
			</div>
			<table class="min-w-full divide-y divide-slate-200 text-sm">
				<thead class="bg-slate-50 text-left text-slate-600">
					<tr>
						<th class="px-4 py-3 font-medium">Type</th>
						<th class="px-4 py-3 font-medium">Invoice No.</th>
						<th class="px-4 py-3 font-medium">Client</th>
						<th class="px-4 py-3 font-medium">Date</th>
						<th class="px-4 py-3 font-medium text-right">Amount</th>
						<th class="px-4 py-3 font-medium text-right">GST</th>
						<th class="px-4 py-3 font-medium">Notes</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					{#each data.revenueRecords as rec}
						<tr class="hover:bg-slate-50">
							<td class="px-4 py-3">
								<span class="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
									{invoiceTypeLabel(rec.invoiceType)}
								</span>
							</td>
							<td class="px-4 py-3 font-medium text-slate-800">{rec.invoiceNumber || '-'}</td>
							<td class="px-4 py-3 text-slate-600">{rec.clientName || '-'}</td>
							<td class="px-4 py-3 text-slate-600">{formatDate(rec.date)}</td>
							<td class="px-4 py-3 text-right font-medium text-slate-800">
								{money(rec.amount, rec.currency)}
								{#if rec.currency !== 'SGD' && rec.sgdEquivalent}
									<span class="block text-xs text-slate-500">{money(rec.sgdEquivalent)}</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-right text-slate-600">{money(rec.gstAmount, rec.currency)}</td>
							<td class="px-4 py-3 max-w-[200px] truncate text-slate-500 text-xs">{rec.notes || '-'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<!-- AR Invoices table (backward compat) -->
	{#if data.invoices.length > 0}
		<div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			<div class="border-b border-slate-200 px-5 py-3">
				<h3 class="text-sm font-medium text-slate-900">AR Invoices (Legacy)</h3>
			</div>
			<table class="min-w-full divide-y divide-slate-200 text-sm">
				<thead class="bg-slate-50 text-left text-slate-600">
					<tr>
						<th class="px-4 py-3 font-medium">Invoice No.</th>
						<th class="px-4 py-3 font-medium">Date</th>
						<th class="px-4 py-3 font-medium">Due Date</th>
						<th class="px-4 py-3 font-medium text-right">Total</th>
						<th class="px-4 py-3 font-medium">Status</th>
						<th class="px-4 py-3 font-medium">Action</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					{#each data.invoices as invoice}
						<tr class="hover:bg-slate-50">
							<td class="px-4 py-3 font-medium text-slate-800">{invoice.invoiceNo}</td>
							<td class="px-4 py-3 text-slate-600">{formatDate(invoice.date)}</td>
							<td class="px-4 py-3 text-slate-600">{formatDate(invoice.dueDate)}</td>
							<td class="px-4 py-3 text-right font-medium text-slate-800">
								{money(invoice.total, invoice.currency || 'SGD')}
							</td>
							<td class="px-4 py-3">
								<span class="rounded-full px-2 py-0.5 text-xs font-medium {statusBadgeClass(invoice.status)}">
									{invoice.status || 'draft'}
								</span>
							</td>
							<td class="px-4 py-3">
								<a class="text-[var(--sf-green)] hover:underline" href="/projects/{data.project.id}/documents/revenue/{invoice.id}">View</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if data.revenueRecords.length === 0 && data.invoices.length === 0}
		<div class="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
			<p class="text-slate-500">No revenue records yet. Record revenue or generate an invoice.</p>
		</div>
	{/if}
</div>

<!-- New revenue modal -->
{#if showNewRevenue}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button type="button" class="absolute inset-0 bg-black/40" aria-label="Close" onclick={() => (showNewRevenue = false)}></button>
		<div class="relative w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
			<div class="border-b border-slate-200 bg-slate-50 px-5 py-4">
				<h3 class="text-base font-semibold text-slate-900">Record Revenue</h3>
				<p class="text-sm text-slate-500">Recording means payment received. Issue the invoice, collect payment, then record it here.</p>
			</div>
			<form method="POST" action="?/createRevenue" use:enhance class="space-y-4 p-5">
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="block text-sm font-medium text-slate-700" for="invoiceType">Invoice Type</label>
						<select id="invoiceType" name="invoiceType" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required>
							<option value="standard">Standard</option>
							<option value="zero_rate">Zero Rate</option>
							<option value="tax_invoice">Tax Invoice (9% GST)</option>
						</select>
					</div>
					<div>
						<label class="block text-sm font-medium text-slate-700" for="invoiceNumber">Invoice Number</label>
						<input type="text" id="invoiceNumber" name="invoiceNumber" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="INV-2024-001" />
					</div>
				</div>
				<div>
					<label class="block text-sm font-medium text-slate-700" for="clientName">Client Name</label>
					<input type="text" id="clientName" name="clientName" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="block text-sm font-medium text-slate-700" for="revenueDate">Date</label>
						<input type="date" id="revenueDate" name="date" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={new Date().toISOString().slice(0, 10)} required />
					</div>
					<div>
						<label class="block text-sm font-medium text-slate-700" for="revenueCurrency">Currency</label>
						<select id="revenueCurrency" name="currency" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
							<option value="SGD">SGD</option>
							<option value="USD">USD</option>
							<option value="CNY">CNY</option>
						</select>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="block text-sm font-medium text-slate-700" for="revenueAmount">Amount</label>
						<input type="number" id="revenueAmount" name="amount" step="0.01" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
					</div>
					<div>
						<label class="block text-sm font-medium text-slate-700" for="revenueGst">GST Amount</label>
						<input type="number" id="revenueGst" name="gstAmount" step="0.01" value="0" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
					</div>
				</div>
				<div>
					<label class="block text-sm font-medium text-slate-700" for="revenueNotes">Notes</label>
					<textarea id="revenueNotes" name="notes" rows="2" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Notes"></textarea>
				</div>
				<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
					<button type="button" class="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onclick={() => (showNewRevenue = false)}>Cancel</button>
					<button type="submit" class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]">Record Revenue</button>
				</div>
			</form>
		</div>
	</div>
{/if}

