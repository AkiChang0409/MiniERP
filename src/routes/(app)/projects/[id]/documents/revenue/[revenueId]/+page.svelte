<script lang="ts">
	import { goto } from '$app/navigation';
	import StorageTextPreview from '$app-layer/components/StorageTextPreview.svelte';
	import LineItemsView from '$app-layer/components/finance/LineItemsView.svelte';

	let { data } = $props();
	const base = $derived(`/projects/${data.revenue.projectId}`);

	const money = (value: number | null | undefined) =>
		new Intl.NumberFormat('en-SG', { style: 'currency', currency: data.revenue.currency ?? 'SGD' }).format(
			value ?? 0
		);

	const fmtWhen = (iso: string | undefined) => {
		if (!iso) return '-';
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-SG');
	};

	const invoiceTypeLabel = (t: string | null) => {
		if (t === 'zero_rate') return 'Zero Rate';
		if (t === 'tax_invoice') return 'Tax Invoice';
		return 'Standard';
	};
</script>

<div class="space-y-5">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<button
			type="button"
			class="text-xs font-medium text-[var(--sf-green)] hover:underline"
			onclick={() => goto(`${base}/documents`)}
		>
			�?Back to documents
		</button>
		<a
			class="text-xs font-medium text-slate-500 hover:text-[var(--sf-green)] hover:underline"
			href={`${base}/revenue`}
		>
			Open in Revenue view
		</a>
	</div>

	<section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
		<div class="border-b border-slate-200 px-5 py-4">
			<p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Revenue document</p>
			<h2 class="mt-1 text-lg font-medium text-slate-900">
				{data.revenue.invoiceNumber ?? 'Revenue Invoice'}
			</h2>
			<p class="mt-0.5 font-mono text-xs text-slate-400">{data.revenue.id}</p>
		</div>

		<div class="grid gap-px bg-slate-200 sm:grid-cols-2">
			<div class="bg-white px-5 py-3">
				<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Invoice Type</p>
				<p class="mt-1 text-sm text-slate-900">{invoiceTypeLabel(data.revenue.invoiceType)}</p>
			</div>
			<div class="bg-white px-5 py-3">
				<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Customer</p>
				<p class="mt-1 text-sm text-slate-900">{data.revenue.clientName ?? '-'}</p>
			</div>
			<div class="bg-white px-5 py-3">
				<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Amount</p>
				<p class="mt-1 text-sm text-slate-900">{money(data.revenue.amount)}</p>
			</div>
			<div class="bg-white px-5 py-3">
				<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">GST Amount</p>
				<p class="mt-1 text-sm text-slate-900">{money(data.revenue.gstAmount)}</p>
			</div>
			<div class="bg-white px-5 py-3">
				<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Date</p>
				<p class="mt-1 text-sm text-slate-900">{data.revenue.date}</p>
			</div>
			<div class="bg-white px-5 py-3">
				<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Currency</p>
				<p class="mt-1 text-sm text-slate-900">{data.revenue.currency}</p>
			</div>
			<div class="bg-white px-5 py-3 sm:col-span-2">
				<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Document Ref</p>
				<p class="mt-1 break-all font-mono text-xs text-slate-600">
					{data.revenue.documentRef ?? 'No file attached'}
				</p>
			</div>
			<div class="bg-white px-5 py-3 sm:col-span-2">
				<p class="text-[11px] font-medium uppercase tracking-wide text-slate-400">Created / updated</p>
				<p class="mt-1 text-sm text-slate-800">
					{fmtWhen(data.revenue.createdAt)} · {fmtWhen(data.revenue.updatedAt)}
				</p>
			</div>
		</div>
	</section>

	{#if data.revenue.notes}
		<section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			<div class="border-b border-slate-200 px-5 py-3">
				<h3 class="text-[13px] font-medium text-slate-900">Notes</h3>
			</div>
			<div class="px-5 py-4">
				<pre class="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-700">{data.revenue.notes}</pre>
			</div>
		</section>
	{/if}

	<LineItemsView
		items={(data.docMeta as Record<string, unknown>).line_items}
		currency={data.revenue.currency}
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
					title="Revenue PDF preview"
					src={data.fileViewUrl}
				></iframe>
			{:else if data.previewDisplay === 'image'}
				<div class="flex justify-center rounded-lg border border-slate-200 bg-slate-50 p-4">
					<img
						class="max-h-[min(75vh,900px)] max-w-full object-contain"
						alt="Revenue attachment preview"
						src={data.fileViewUrl}
					/>
				</div>
			{:else if data.previewDisplay === 'text' && data.fileViewUrl}
				<p class="mb-2 text-xs text-slate-500">Extracted text (Word, plain text, CSV, etc.)</p>
				<StorageTextPreview fileViewUrl={data.fileViewUrl} />
			{:else}
				<p class="text-sm text-slate-600">
					Inline preview is not available for this file type (e.g. Excel, PowerPoint, or legacy .doc).
					<a class="ml-1 font-medium text-[var(--sf-green)] hover:underline" href={data.fileViewUrl} target="_blank" rel="noreferrer">Open / download</a>
				</p>
			{/if}
		</div>
	</section>
</div>


