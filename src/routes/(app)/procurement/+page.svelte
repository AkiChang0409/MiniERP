<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import ProcurementSubNav from '$app-layer/components/procurement/ProcurementSubNav.svelte';

	let { data } = $props();

	const stages = [
		{
			href: '/procurement/rfqs',
			step: '1',
			title: 'RFQs',
			summary:
				'Create RFQs from purchase requisitions or MRP. Invite suppliers, collect quotations, compare and pick the winner.',
			metrics: [
				{ label: 'Open RFQs', value: data.counts.rfqsOpen },
				{ label: 'Awaiting quotes', value: data.counts.rfqsAwaitingQuotes }
			]
		},
		{
			href: '/procurement/purchase-orders',
			step: '2',
			title: 'Purchase Orders',
			summary:
				'Review POs from the chosen quotation or create one manually. Approval gates by supplier risk + amount. Send & track supplier acknowledgment.',
			metrics: [
				{ label: 'Pending approval', value: data.counts.posPendingApproval },
				{ label: 'Awaiting supplier ACK', value: data.counts.posAwaitingAck }
			]
		},
		{
			href: '/procurement/receiving',
			step: '3',
			title: 'Receiving / QC',
			summary:
				'Record goods receipts against open POs. Stock routed to receiving or quarantine bin per QC flag. Inspectors accept / reject / quarantine.',
			metrics: [{ label: 'Awaiting QC decision', value: data.counts.receiptsPendingInspection }]
		},
		{
			href: '/procurement/supplier-invoices',
			step: '4',
			title: 'Supplier Invoices',
			summary:
				'3-way matching: Invoice vs PO vs GRN. Clean matches auto-approve and trigger AP. >5% price variance raises IA004 for manual review.',
			metrics: [
				{ label: 'Pending review', value: data.counts.invoicesPendingReview },
				{ label: 'IA004 alerts', value: data.counts.invoicesWithIa004 }
			]
		}
	];
</script>

<PageShell
	eyebrow="Procurement"
	title="Procure-to-Pay overview"
	description="Each stage of the procurement workflow lives on its own page. Pick a card to jump in, or watch the counters for things that need attention."
>
	<ProcurementSubNav />

	<div class="grid gap-4 md:grid-cols-2">
		{#each stages as stage}
			<a
				href={stage.href}
				class="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-[var(--sf-green,#387234)] hover:shadow-md"
			>
				<div class="flex items-start justify-between gap-4">
					<div>
						<p class="text-xs font-semibold uppercase tracking-wide text-[var(--sf-green,#387234)]">
							Step {stage.step}
						</p>
						<h3 class="mt-1 text-lg font-semibold text-slate-900">{stage.title}</h3>
					</div>
					<span class="text-xl text-slate-300">→</span>
				</div>
				<p class="mt-3 text-sm text-slate-600">{stage.summary}</p>
				<dl class="mt-4 flex flex-wrap gap-3">
					{#each stage.metrics as metric}
						<div class="rounded-md bg-slate-50 px-3 py-2 text-xs">
							<dt class="text-slate-500">{metric.label}</dt>
							<dd class="mt-0.5 text-base font-semibold text-slate-900">{metric.value}</dd>
						</div>
					{/each}
				</dl>
			</a>
		{/each}
	</div>

	<div class="mt-6 grid gap-4 lg:grid-cols-2">
		<section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<h2 class="text-sm font-semibold text-slate-900">Latest goods receipts</h2>
			{#if data.recentReceipts.length === 0}
				<p class="mt-2 text-sm text-slate-500">No recent receipts.</p>
			{:else}
				<ul class="mt-2 divide-y divide-slate-100 text-sm">
					{#each data.recentReceipts as r}
						<li class="flex items-start justify-between gap-3 py-2">
							<div>
								<a
									class="font-medium text-slate-900 hover:underline"
									href={`/procurement/purchase-orders/${r.poId}`}
								>
									{r.receiptNumber ?? '—'}
								</a>
								<p class="text-xs text-slate-500">
									{r.poNumber} · {r.supplierName ?? '—'} · qty {r.quantityReceived}
								</p>
							</div>
							<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] capitalize text-slate-700">
								{(r.status ?? 'accepted').replace('_', ' ')}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<h2 class="text-sm font-semibold text-slate-900">Latest supplier invoices</h2>
			{#if data.recentInvoices.length === 0}
				<p class="mt-2 text-sm text-slate-500">No supplier invoices yet.</p>
			{:else}
				<ul class="mt-2 divide-y divide-slate-100 text-sm">
					{#each data.recentInvoices as inv}
						<li class="flex items-start justify-between gap-3 py-2">
							<div>
								<a
									class="font-medium text-slate-900 hover:underline"
									href={`/procurement/supplier-invoices?invoice=${inv.id}`}
								>
									{inv.invoiceReference}
								</a>
								<p class="text-xs text-slate-500">
									{inv.supplier?.name ?? '—'} · {inv.invoiceNumber}
								</p>
							</div>
							<div class="flex flex-col items-end gap-1">
								<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] capitalize text-slate-700">
									{inv.matchStatus.replace('_', ' ')}
								</span>
								{#if inv.iaExceptionCode}
									<span class="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">
										{inv.iaExceptionCode}
									</span>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</PageShell>
