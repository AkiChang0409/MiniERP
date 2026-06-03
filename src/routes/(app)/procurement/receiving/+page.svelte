<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import ProcurementSubNav from '$app-layer/components/procurement/ProcurementSubNav.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<PageShell
	eyebrow="Procurement"
	title="Receiving & Quality Control"
	description="Open POs awaiting goods receipt, plus any GRN still waiting on an inspector. Click a row to jump into the PO and record receipt against a specific line."
>
	<ProcurementSubNav />

	{#if form?.error}
		<div class="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{form.error}</div>
	{/if}

	{#if data.pendingReceipts.length > 0}
		<section class="mb-6 rounded-xl border border-amber-200 bg-amber-50/40 shadow-sm">
			<div class="border-b border-amber-200 px-4 py-3">
				<h2 class="text-base font-semibold text-amber-900">Awaiting QC decision ({data.pendingReceipts.length})</h2>
				<p class="text-xs text-amber-800">Inspector decides each pending GRN. Accept releases stock to receiving bin + triggers payment; reject scraps it; quarantine keeps it parked.</p>
			</div>
			<div class="divide-y divide-amber-100 px-2">
				{#each data.pendingReceipts as r}
					<div class="p-3 text-xs">
						<div class="flex flex-wrap items-start justify-between gap-2">
							<div>
								<p class="font-semibold text-slate-800">
									<a href={`/procurement/purchase-orders/${r.poId}`} class="hover:underline">{r.receiptNumber}</a>
									· {r.receiptDate}
								</p>
								<p class="text-[11px] text-slate-500">
									PO <a class="underline" href={`/procurement/purchase-orders/${r.poId}`}>{r.poNumber}</a>
									· {r.supplierName ?? '—'} · qty {r.quantityReceived}
									{#if r.overReceiptFlag} · <span class="font-medium text-amber-700">over-receipt</span>{/if}
								</p>
							</div>
							<span class={
								r.inspectionStatus === 'pending'
									? 'rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800'
									: 'rounded-full bg-purple-100 px-2 py-0.5 font-medium text-purple-700'
							}>QC: {r.inspectionStatus}</span>
						</div>
						<form class="mt-2 grid gap-1 sm:grid-cols-[1fr_1fr_2fr_auto_auto_auto]" method="POST" action="?/inspectReceipt" use:enhance>
							<input type="hidden" name="receiptId" value={r.id} />
							<input type="number" step="0.01" min="0" name="acceptedQuantity" value={r.quantityReceived} class="rounded-md border border-slate-300 px-2 py-1 text-[11px]" placeholder="Accept qty" />
							<input type="number" step="0.01" min="0" name="rejectedQuantity" class="rounded-md border border-slate-300 px-2 py-1 text-[11px]" placeholder="Reject qty" />
							<input name="reason" class="rounded-md border border-slate-300 px-2 py-1 text-[11px]" placeholder="Reason / return note" />
							<button name="decision" value="accept" class="rounded-md bg-green-700 px-2 py-1 text-[11px] font-medium text-white" type="submit">Accept</button>
							<button name="decision" value="quarantine" class="rounded-md bg-purple-700 px-2 py-1 text-[11px] font-medium text-white" type="submit">Quarantine</button>
							<button name="decision" value="reject" class="rounded-md bg-red-700 px-2 py-1 text-[11px] font-medium text-white" type="submit">Reject</button>
							<label class="flex items-center gap-1 text-[10px] text-slate-600 sm:col-span-6">
								<input type="checkbox" name="returnRequired" /> mark for return-to-supplier
							</label>
						</form>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<section class="rounded-xl border border-slate-200 bg-white shadow-sm">
		<div class="flex items-baseline justify-between border-b border-slate-200 px-4 py-3">
			<h2 class="text-base font-semibold text-slate-900">Open POs awaiting receipt</h2>
			<span class="text-xs text-slate-500">{data.openPos.length} open</span>
		</div>
		{#if data.openPos.length === 0}
			<p class="px-4 py-6 text-sm text-slate-500">Nothing waiting to receive.</p>
		{:else}
			<ul class="divide-y divide-slate-100">
				{#each data.openPos as po}
					{@const pct = po.ordered > 0 ? Math.min(100, Math.round((po.received / po.ordered) * 100)) : 0}
					<li>
						<a
							href={`/procurement/purchase-orders/${po.id}`}
							class="group flex items-center gap-4 px-4 py-3 transition hover:bg-slate-50"
						>
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<p class="truncate font-medium text-slate-900 group-hover:text-[var(--sf-green)]">{po.poNumber}</p>
									<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] capitalize text-slate-600">
										ACK {po.ackStatus.replace('_', ' ')}
									</span>
								</div>
								<p class="mt-0.5 truncate text-xs text-slate-500">
									{po.supplierName ?? '—'} · delivery {po.deliveryDate ?? '—'} · {po.lineCount} line{po.lineCount === 1 ? '' : 's'}
								</p>
							</div>

							<div class="hidden w-64 shrink-0 sm:block">
								<div class="flex items-baseline justify-between text-[11px] text-slate-500">
									<span>Received {po.received} / {po.ordered}</span>
									<span>Back-order {po.backOrder}</span>
								</div>
								<div class="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
									<div class="h-full bg-[var(--sf-green,#387234)]" style="width: {pct}%"></div>
								</div>
							</div>

							<span class="ml-2 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[var(--sf-green)]" aria-hidden="true">
								<svg viewBox="0 0 20 20" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M7 5l6 5-6 5" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</PageShell>
