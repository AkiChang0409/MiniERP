<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import {
		EXPENSE_CATEGORY_OPTIONS,
		CATEGORY_LABELS,
		ALLOWANCE_RATES,
		type ExpenseType
	} from '$modules/finance/domain/expense-upload';

	let { data } = $props();

	const money = (value: number, currency = 'SGD') =>
		new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(value ?? 0);

	const formatDate = (date: string | null) => {
		if (!date) return '-';
		return new Date(date).toLocaleDateString('en-SG', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	};

	const gstCell = (gst: number | null | undefined, currency: string) => {
		if (gst == null || gst === 0) return '-';
		return money(gst, currency);
	};

	let showManualEntry = $state(false);
	let showNewTrip = $state(false);
	let filterType = $state<'all' | ExpenseType>('all');

	const filteredExpenses = $derived.by(() => {
		return data.expenses.filter((exp) => {
			if (filterType !== 'all' && exp.expenseType !== filterType) return false;
			return true;
		});
	});

	const typeLabel = (t: string | null) => (t === 'sales_cost' ? 'SC' : 'OpEx');

	const expenseDocumentHref = (expenseId: string) =>
		`/projects/${page.params.id}/documents/expenses/${expenseId}`;
	const categoryLabel = (c: string) => (CATEGORY_LABELS as Record<string, string>)[c] ?? c;

	const defaultAllowanceRate = (dest: string) => {
		const lower = dest.toLowerCase();
		return ALLOWANCE_RATES[lower] ?? 50;
	};

	let tripDestination = $state('china');
	let tripAllowanceRate = $derived(defaultAllowanceRate(tripDestination));
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-xl font-semibold text-slate-900">Expenses</h1>
		<p class="mt-1 text-sm text-slate-500">Manage project expenses and track costs.</p>
	</div>

	<!-- Summary cards -->
	<div class="grid gap-4 sm:grid-cols-3">
		<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Total Expenses</p>
			<p class="mt-1 text-xl font-semibold text-slate-900">{money(data.totals.total)}</p>
		</div>
		<div class="rounded-xl border border-purple-200 bg-purple-50 p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-purple-600">Operating Expenses</p>
			<p class="mt-1 text-xl font-semibold text-purple-900">{money(data.totals.opex)}</p>
		</div>
		<div class="rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
			<p class="text-[11px] font-medium uppercase tracking-wide text-sky-600">Sales Cost</p>
			<p class="mt-1 text-xl font-semibold text-sky-900">{money(data.totals.salesCost)}</p>
		</div>
	</div>

	<!-- Actions -->
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<select bind:value={filterType} class="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
				<option value="all">All Types</option>
				<option value="opex">Operating Expenses</option>
				<option value="sales_cost">Sales Cost</option>
			</select>
		</div>
		<div class="flex items-center gap-2">
			<a
				class="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
				href={`/finance/expenses/upload?projectId=${encodeURIComponent(page.params.id)}`}
			>
				Upload expense file
			</a>
			<button
				type="button"
				class="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
				onclick={() => (showNewTrip = true)}
			>
				New Business Trip
			</button>
			<button
				type="button"
				class="rounded-md bg-[var(--sf-green)] px-3 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]"
				onclick={() => (showManualEntry = true)}
			>
				Manual Entry
			</button>
		</div>
	</div>

	<!-- Business trips section -->
	{#if data.businessTrips.length > 0}
		<div class="rounded-xl border border-slate-200 bg-white shadow-sm">
			<div class="border-b border-slate-200 px-5 py-3">
				<h3 class="text-sm font-medium text-slate-900">Business Trips</h3>
			</div>
			<div class="divide-y divide-slate-100">
				{#each data.businessTrips as trip}
					<div class="flex items-center justify-between px-5 py-3">
						<div>
							<p class="font-medium text-slate-800">{trip.destination ?? '-'}</p>
							<p class="text-xs text-slate-500">{trip.startDate ?? '-'} to {trip.endDate ?? '-'} · {trip.days ?? 0} days</p>
						</div>
						<div class="text-right">
							<p class="font-medium text-slate-800">{money((trip.days ?? 0) * (trip.dailyAllowanceRate ?? 0))}</p>
							<p class="text-xs text-slate-500">${trip.dailyAllowanceRate ?? 0}/day</p>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Expense table -->
	<div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-slate-200 text-sm">
			<thead class="bg-slate-50 text-left text-slate-600">
				<tr>
					<th class="px-4 py-3 font-medium">Type</th>
					<th class="px-4 py-3 font-medium">Date</th>
					<th class="px-4 py-3 font-medium">Category</th>
					<th class="px-4 py-3 font-medium">Name/Vendor</th>
					<th class="px-4 py-3 font-medium text-right">Amount</th>
					<th class="px-4 py-3 font-medium">Project Name</th>
					<th class="px-4 py-3 font-medium text-right">GST</th>
					<th class="px-4 py-3 font-medium">Status</th>
					<th class="px-4 py-3 font-medium">Notes</th>
					<th class="px-4 py-3 font-medium text-right">File</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#if filteredExpenses.length === 0}
					<tr>
						<td class="px-4 py-8 text-center text-slate-500" colspan="10">No expenses found.</td>
					</tr>
				{:else}
					{#each filteredExpenses as expense}
						<tr class="hover:bg-slate-50">
							<td class="px-4 py-3">
								<span
									class="rounded px-2 py-0.5 text-xs font-medium {expense.expenseType === 'sales_cost'
										? 'bg-sky-100 text-sky-700'
										: 'bg-purple-100 text-purple-700'}"
								>
									{typeLabel(expense.expenseType)}
								</span>
							</td>
							<td class="px-4 py-3 text-slate-600">{formatDate(expense.date)}</td>
							<td class="px-4 py-3 text-slate-600">{categoryLabel(expense.category)}</td>
							<td class="px-4 py-3 font-medium text-slate-800">
								{expense.vendorOrSupplier || expense.staffName || '-'}
							</td>
							<td class="px-4 py-3 text-right font-medium text-slate-800">
								{money(expense.amount, expense.currency)}
								{#if expense.currency !== 'SGD' && expense.sgdEquivalent}
									<span class="block text-xs text-slate-500">{money(expense.sgdEquivalent)} SGD eq.</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-slate-700">{expense.projectName}</td>
							<td class="px-4 py-3 text-right text-slate-600">{gstCell(expense.gstAmount, expense.currency)}</td>
							<td class="px-4 py-3">
								<div class="text-slate-800">{expense.statusLabel}</div>
								<div class="mt-1 flex flex-wrap gap-1">
									{#if expense.reimbursement}
										<span class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Reimb</span>
									{/if}
									{#if expense.businessTrip}
										<span class="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">Trip</span>
									{/if}
								</div>
							</td>
							<td class="px-4 py-3 max-w-[220px] truncate text-slate-500 text-xs" title={expense.notes ?? ''}>
								{expense.notes || '-'}
							</td>
							<td class="px-4 py-3 text-right">
								{#if expense.hasAttachment}
									<a
										class="text-sm font-medium text-[var(--sf-green)] hover:underline"
										href={expenseDocumentHref(expense.id)}
									>
										View
									</a>
								{:else}
									<span class="text-slate-400">-</span>
								{/if}
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</div>

<!-- Manual entry modal -->
{#if showManualEntry}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button type="button" class="absolute inset-0 bg-black/40" aria-label="Close" onclick={() => (showManualEntry = false)}></button>
		<div class="relative w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
			<div class="border-b border-slate-200 bg-slate-50 px-5 py-4">
				<h3 class="text-base font-semibold text-slate-900">Manual Expense Entry</h3>
				<p class="text-sm text-slate-500">Saving confirms the expense and links it to this project.</p>
			</div>
			<form method="POST" action="?/create" use:enhance class="space-y-4 p-5">
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="block text-sm font-medium text-slate-700" for="date">Date</label>
						<input type="date" id="date" name="date" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={new Date().toISOString().slice(0, 10)} required />
					</div>
					<div>
						<label class="block text-sm font-medium text-slate-700" for="expenseType">Expense Type</label>
						<select id="expenseType" name="expenseType" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
							<option value="opex">Operating Expenses</option>
							<option value="sales_cost">Sales Cost</option>
						</select>
					</div>
				</div>
				<div>
					<label class="block text-sm font-medium text-slate-700" for="category">Category</label>
					<select id="category" name="category" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required>
						<optgroup label="Operating Expenses">
							{#each EXPENSE_CATEGORY_OPTIONS.opex as cat}
								<option value={cat}>{CATEGORY_LABELS[cat]}</option>
							{/each}
						</optgroup>
						<optgroup label="Sales Cost">
							{#each EXPENSE_CATEGORY_OPTIONS.sales_cost as cat}
								<option value={cat}>{CATEGORY_LABELS[cat]}</option>
							{/each}
						</optgroup>
					</select>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="block text-sm font-medium text-slate-700" for="amount">Amount</label>
						<input type="number" id="amount" name="amount" step="0.01" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
					</div>
					<div>
						<label class="block text-sm font-medium text-slate-700" for="currency">Currency</label>
						<select id="currency" name="currency" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
							<option value="SGD">SGD</option>
							<option value="USD">USD</option>
							<option value="CNY">CNY</option>
						</select>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="block text-sm font-medium text-slate-700" for="vendorOrSupplier">Vendor/Supplier</label>
						<input type="text" id="vendorOrSupplier" name="vendorOrSupplier" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
					</div>
					<div>
						<label class="block text-sm font-medium text-slate-700" for="staffName">Staff Name</label>
						<select id="staffName" name="staffName" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
							<option value="">-- none --</option>
							{#each data.employees as emp}
								<option value={emp.name}>{emp.name}</option>
							{/each}
						</select>
					</div>
				</div>
				<div class="flex items-center gap-6">
					<label class="flex items-center gap-2 text-sm text-slate-700">
						<input type="checkbox" name="reimbursement" class="rounded border-slate-300" /> Reimbursement
					</label>
					<label class="flex items-center gap-2 text-sm text-slate-700">
						<input type="checkbox" name="businessTrip" class="rounded border-slate-300" /> Business Trip
					</label>
				</div>
				<div>
					<label class="block text-sm font-medium text-slate-700" for="notes">Notes</label>
					<textarea id="notes" name="notes" rows="2" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"></textarea>
				</div>
				<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
					<button type="button" class="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onclick={() => (showManualEntry = false)}>Cancel</button>
					<button type="submit" class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]">Create Expense</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- New business trip modal -->
{#if showNewTrip}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button type="button" class="absolute inset-0 bg-black/40" aria-label="Close" onclick={() => (showNewTrip = false)}></button>
		<div class="relative w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
			<div class="border-b border-slate-200 bg-slate-50 px-5 py-4">
				<h3 class="text-base font-semibold text-slate-900">New Business Trip</h3>
				<p class="text-sm text-slate-500">Creates a trip record and an allowance expense automatically.</p>
			</div>
			<form method="POST" action="?/createTrip" use:enhance class="space-y-4 p-5">
				<div>
					<label class="block text-sm font-medium text-slate-700" for="tripEmployeeId">Employee</label>
					<select id="tripEmployeeId" name="employeeId" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required>
						<option value="">-- Select employee --</option>
						{#each data.employees as emp}
							<option value={emp.id}>{emp.name}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class="block text-sm font-medium text-slate-700" for="tripDestination">Destination</label>
					<select id="tripDestination" name="destination" bind:value={tripDestination} class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required>
						<option value="china">China (SGD 50/day)</option>
						<option value="malaysia">Malaysia (SGD 45/day)</option>
						<option value="other">Other</option>
					</select>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="block text-sm font-medium text-slate-700" for="startDate">Start Date</label>
						<input type="date" id="startDate" name="startDate" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
					</div>
					<div>
						<label class="block text-sm font-medium text-slate-700" for="endDate">End Date</label>
						<input type="date" id="endDate" name="endDate" class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
					</div>
				</div>
				<div>
					<label class="block text-sm font-medium text-slate-700" for="dailyAllowanceRate">Daily Allowance Rate (SGD)</label>
					<input type="number" id="dailyAllowanceRate" name="dailyAllowanceRate" step="0.01" value={tripAllowanceRate} class="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
					<p class="mt-1 text-xs text-slate-500">Default: ${tripAllowanceRate}/day</p>
				</div>
				<div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
					<button type="button" class="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onclick={() => (showNewTrip = false)}>Cancel</button>
					<button type="submit" class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]">Create Trip</button>
				</div>
			</form>
		</div>
	</div>
{/if}


