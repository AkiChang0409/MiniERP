<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const formAny = $derived(form as { message?: string; shipped?: boolean; received?: boolean; cancelled?: boolean } | null | undefined);
	const t = $derived(data.transfer);
</script>

<PageShell
	eyebrow="Inventory · Transfer"
	title={t.transferNumber}
	description={`${data.sourceWh?.code ?? '?'} → ${data.destWh?.code ?? '?'} · status ${t.status}`}
>
	<div class="mb-4 flex flex-wrap gap-3">
		<a href="/inventory/transfers" class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Back</a>
		{#if t.status === 'draft'}
			<form method="POST" action="?/ship" use:enhance>
				<button class="rounded-md bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-700">Ship (decrement source)</button>
			</form>
			<form method="POST" action="?/cancel" use:enhance>
				<button class="rounded-md border border-rose-300 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">Cancel</button>
			</form>
		{/if}
	</div>

	{#if formAny?.message}
		<p class="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{formAny.message}</p>
	{/if}
	{#if formAny?.shipped}
		<p class="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Shipped. Stock decremented at source.</p>
	{/if}
	{#if formAny?.received}
		<p class="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Received. Stock incremented at destination.</p>
	{/if}
	{#if formAny?.cancelled}
		<p class="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">Cancelled.</p>
	{/if}

	<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm mb-6">
		<div class="grid gap-4 md:grid-cols-3 text-sm">
			<div>
				<div class="text-xs uppercase text-slate-500">Status</div>
				<div class="font-medium capitalize">{t.status.replace('_', ' ')}</div>
			</div>
			<div>
				<div class="text-xs uppercase text-slate-500">Requested</div>
				<div>{t.requestedAt ?? '—'}</div>
			</div>
			<div>
				<div class="text-xs uppercase text-slate-500">Notes</div>
				<div>{t.notes ?? '—'}</div>
			</div>
			<div>
				<div class="text-xs uppercase text-slate-500">From warehouse</div>
				<div>{data.sourceWh?.code} — {data.sourceWh?.name}</div>
			</div>
			<div>
				<div class="text-xs uppercase text-slate-500">To warehouse</div>
				<div>{data.destWh?.code} — {data.destWh?.name}</div>
			</div>
			<div>
				<div class="text-xs uppercase text-slate-500">Shipped / Received</div>
				<div class="text-xs text-slate-600">{t.shippedAt ?? '—'} · {t.receivedAt ?? '—'}</div>
			</div>
		</div>
	</div>

	<form method="POST" action="?/receive" use:enhance>
		<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
			<table class="min-w-full divide-y divide-slate-200 text-sm">
				<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
					<tr>
						<th class="px-4 py-3">Item</th>
						<th class="px-4 py-3">Source bin</th>
						<th class="px-4 py-3">Dest bin</th>
						<th class="px-4 py-3 text-right">Requested</th>
						<th class="px-4 py-3 text-right">Shipped</th>
						<th class="px-4 py-3 text-right">Received</th>
						{#if t.status === 'in_transit'}
							<th class="px-4 py-3 text-right">Receive qty</th>
						{/if}
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					{#each data.lines as line}
						<tr>
							<td class="px-4 py-3">
								<div class="font-mono text-xs">{line.item?.code ?? line.itemId}</div>
								<div class="text-xs text-slate-600">{line.item?.name ?? ''}</div>
							</td>
							<td class="px-4 py-3 font-mono text-xs">{line.sourceBin?.code ?? line.sourceBinId}</td>
							<td class="px-4 py-3 font-mono text-xs">{line.destBin?.code ?? line.destBinId}</td>
							<td class="px-4 py-3 text-right font-mono">{Number(line.quantityRequested).toFixed(2)}</td>
							<td class="px-4 py-3 text-right font-mono">{Number(line.quantityShipped).toFixed(2)}</td>
							<td class="px-4 py-3 text-right font-mono">{Number(line.quantityReceived).toFixed(2)}</td>
							{#if t.status === 'in_transit'}
								<td class="px-4 py-3 text-right">
									<input type="hidden" name="line_id" value={line.id} />
									<input
										name="actual_qty"
										type="number"
										step="any"
										min="0"
										max={Number(line.quantityShipped)}
										value={Number(line.quantityShipped)}
										class="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
									/>
								</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if t.status === 'in_transit'}
			<div class="mt-3 text-right">
				<button class="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">Receive at destination</button>
			</div>
		{/if}
	</form>
</PageShell>
