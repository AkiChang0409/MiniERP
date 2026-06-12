<script lang="ts">
	import { goto } from '$app/navigation';
	import PageShell from '$app-layer/components/PageShell.svelte';
	import StorageTextPreview from '$app-layer/components/StorageTextPreview.svelte';
	import LineItemsView from '$app-layer/components/finance/LineItemsView.svelte';
	import { CATEGORY_LABELS, EXPENSE_CATEGORY_OPTIONS } from '$modules/finance/domain/expense-upload';

	let { data, form } = $props();

	const money = (value: number | null | undefined) =>
		new Intl.NumberFormat('en-SG', { style: 'currency', currency: data.expense.currency ?? 'SGD' }).format(value ?? 0);

	const fmtWhen = (iso: string | undefined) => {
		if (!iso) return '-';
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-SG');
	};

	const categoryLabel = (c: string) => (CATEGORY_LABELS as Record<string, string>)[c] ?? c;
</script>

<PageShell eyebrow="Finance" title="Expense detail" description="Company expense not linked to a project.">
	<div class="space-y-5">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<button
				type="button"
				class="text-xs font-medium text-[var(--sf-green)] hover:underline"
				onclick={() => goto('/finance/expenses')}
			>
				�?Back to company expenses
			</button>
		</div>

		<section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			<div class="border-b border-slate-200 px-5 py-4">
				<p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Expense</p>
				<h2 class="mt-1 text-lg font-medium text-slate-900">
					{categoryLabel(data.expense.category)}
				</h2>
				<p class="mt-0.5 font-mono text-xs text-slate-400">{data.expense.id}</p>
			</div>

			<div class="grid gap-px bg-slate-200 sm:grid-cols-2">
				<div class="bg-white px-5 py-3">
					<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Expense Type</p>
					<p class="mt-1 text-sm text-slate-900">
						{data.expense.expenseType === 'sales_cost' ? 'Sales Cost' : 'Operating Expenses'}
					</p>
				</div>
				<div class="bg-white px-5 py-3">
					<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Category</p>
					<p class="mt-1 text-sm text-slate-900">{categoryLabel(data.expense.category)}</p>
				</div>
				<div class="bg-white px-5 py-3">
					<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Amount</p>
					<p class="mt-1 text-sm text-slate-900">{money(data.expense.amount)}</p>
				</div>
				<div class="bg-white px-5 py-3">
					<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Currency</p>
					<p class="mt-1 text-sm text-slate-900">{data.expense.currency}</p>
				</div>
				<div class="bg-white px-5 py-3">
					<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Date</p>
					<p class="mt-1 text-sm text-slate-900">{data.expense.date}</p>
				</div>
				<div class="bg-white px-5 py-3">
					<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Vendor / Supplier</p>
					<p class="mt-1 text-sm text-slate-900">{data.expense.vendorOrSupplier ?? '-'}</p>
				</div>
				<div class="bg-white px-5 py-3">
					<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Staff</p>
					<p class="mt-1 text-sm text-slate-900">{data.expense.staffName ?? '-'}</p>
				</div>
				<div class="bg-white px-5 py-3">
					<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Project</p>
					<p class="mt-1 text-sm text-slate-500">-</p>
				</div>
				<div class="bg-white px-5 py-3 sm:col-span-2">
					<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Document Ref</p>
					<p class="mt-1 break-all font-mono text-xs text-slate-600">
						{data.expense.documentRef ?? 'No file attached'}
					</p>
				</div>
				<div class="bg-white px-5 py-3 sm:col-span-2">
					<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Created / updated</p>
					<p class="mt-1 text-sm text-slate-800">
						{fmtWhen(data.expense.createdAt)} · {fmtWhen(data.expense.updatedAt)}
					</p>
				</div>
			</div>
		</section>

		{#if data.expense.notes}
			<section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
				<div class="border-b border-slate-200 px-5 py-3">
					<h3 class="text-[13px] font-medium text-slate-900">Notes</h3>
				</div>
				<div class="px-5 py-4">
					<pre class="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-700">{data.expense.notes}</pre>
				</div>
			</section>
		{/if}

		<LineItemsView
			items={(data.docMeta as Record<string, unknown>).line_items}
			currency={data.expense.currency}
		/>

		<section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			<div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
				<div>
					<h3 class="text-[13px] font-medium text-slate-900">File preview</h3>
					<p class="mt-0.5 text-xs text-slate-500">Served from R2 bucket.</p>
				</div>
				{#if data.fileDownloadUrl}
					<a
						class="shrink-0 rounded-md bg-[var(--sf-green)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2f5e2c]"
						href={data.fileDownloadUrl}
					>
						Download
					</a>
				{/if}
			</div>
			<div class="p-4">
				{#if data.previewDisplay === 'none'}
					<p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
						No file attached.
					</p>
				{:else if data.previewDisplay === 'pdf'}
					<iframe
						class="h-[min(75vh,900px)] w-full rounded-lg border border-slate-200 bg-slate-100"
						title="Expense PDF preview"
						src={data.fileViewUrl}
					></iframe>
				{:else if data.previewDisplay === 'image'}
					<div class="flex justify-center rounded-lg border border-slate-200 bg-slate-50 p-4">
						<img
							class="max-h-[min(75vh,900px)] max-w-full object-contain"
							alt="Expense attachment preview"
							src={data.fileViewUrl}
						/>
					</div>
				{:else if data.previewDisplay === 'text' && data.fileViewUrl}
					<p class="mb-2 text-xs text-slate-500">Extracted text (Word, plain text, CSV, etc.)</p>
					<StorageTextPreview fileViewUrl={data.fileViewUrl} />
				{:else}
					<p class="text-sm text-slate-600">
						Inline preview is not available for this file type (e.g. Excel, PowerPoint, or legacy .doc).
						<a
							class="ml-1 font-medium text-[var(--sf-green)] hover:underline"
							href={data.fileViewUrl}
							target="_blank"
							rel="noreferrer">Open / download</a>
					</p>
				{/if}
			</div>
		</section>

		{#if form?.message}
			<p class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{form.message}</p>
		{/if}

		<details class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			<summary class="cursor-pointer border-b border-slate-200 px-5 py-4 text-[13px] font-medium text-slate-900">
				Edit fields
			</summary>
			<form class="space-y-4 p-5" method="POST" action="?/update">
				<div class="grid gap-3 sm:grid-cols-2">
					<label class="block space-y-1 text-xs font-medium text-slate-700">
						Expense Type
						<select
							class="h-9 w-full rounded-md border border-slate-300 px-2.5 text-sm"
							name="expenseType"
							value={data.expense.expenseType ?? 'opex'}
						>
							<option value="opex">Operating Expenses</option>
							<option value="sales_cost">Sales Cost</option>
						</select>
					</label>
					<label class="block space-y-1 text-xs font-medium text-slate-700">
						Category
						<select
							class="h-9 w-full rounded-md border border-slate-300 px-2.5 text-sm"
							name="category"
							required
							value={data.expense.category}
						>
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
					</label>
					<label class="block space-y-1 text-xs font-medium text-slate-700">
						Amount
						<input
							class="h-9 w-full rounded-md border border-slate-300 px-2.5 text-sm"
							name="amount"
							type="number"
							step="0.01"
							value={data.expense.amount}
						/>
					</label>
					<label class="block space-y-1 text-xs font-medium text-slate-700">
						Currency
						<input
							class="h-9 w-full rounded-md border border-slate-300 px-2.5 text-sm"
							name="currency"
							value={data.expense.currency}
						/>
					</label>
					<label class="block space-y-1 text-xs font-medium text-slate-700 sm:col-span-2">
						Date
						<input
							class="h-9 w-full rounded-md border border-slate-300 px-2.5 text-sm"
							name="date"
							type="date"
							required
							value={data.expense.date}
						/>
					</label>
					<label class="block space-y-1 text-xs font-medium text-slate-700">
						Staff
						<input
							class="h-9 w-full rounded-md border border-slate-300 px-2.5 text-sm"
							name="staffName"
							value={data.expense.staffName ?? ''}
						/>
					</label>
					<label class="block space-y-1 text-xs font-medium text-slate-700">
						Vendor / Supplier
						<input
							class="h-9 w-full rounded-md border border-slate-300 px-2.5 text-sm"
							name="vendorOrSupplier"
							value={data.expense.vendorOrSupplier ?? ''}
						/>
					</label>
					<label class="block space-y-1 text-xs font-medium text-slate-700 sm:col-span-2">
						Notes
						<input
							class="h-9 w-full rounded-md border border-slate-300 px-2.5 text-sm"
							name="notes"
							value={data.expense.notes ?? ''}
						/>
					</label>
				</div>
				<button
					class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]"
					type="submit"
				>
					Save changes
				</button>
			</form>
			<div class="border-t border-slate-200 px-5 py-4">
				<form method="POST" action="?/delete">
					<button
						class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 hover:bg-rose-100"
						type="submit"
					>
						Delete record
					</button>
				</form>
			</div>
		</details>
	</div>
</PageShell>


