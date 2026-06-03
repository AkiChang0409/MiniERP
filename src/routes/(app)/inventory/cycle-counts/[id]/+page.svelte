<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const formAny = $derived(form as { message?: string; recorded?: number; posted?: boolean; cancelled?: boolean; documentAttached?: boolean; fileName?: string } | null | undefined);

	const s = $derived(data.session);
	const editable = $derived(s.status === 'counting' || s.status === 'draft');
	const docRef = $derived(s.documentRef as string | null);
	const uploadedDoc = $derived(typeof docRef === 'string' && docRef.startsWith('r2:'));
	const uploadedFileName = $derived(uploadedDoc ? (docRef as string).split('/').pop() ?? 'signed document' : null);
</script>

<PageShell
	eyebrow="Inventory · Cycle count"
	title={s.countNumber}
	description={`${data.warehouse?.code ?? '—'} · type ${s.countType.replace('_', ' ')} · status ${s.status}`}
>
	<div class="mb-4 flex flex-wrap gap-3">
		<a href="/inventory/cycle-counts" class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Back</a>
		{#if editable}
			<form method="POST" action="?/post" use:enhance>
				<button class="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">Post variances</button>
			</form>
			<form method="POST" action="?/cancel" use:enhance>
				<button class="rounded-md border border-rose-300 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">Cancel session</button>
			</form>
		{/if}
	</div>

	{#if formAny?.message}
		<p class="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{formAny.message}</p>
	{/if}
	{#if formAny?.recorded !== undefined}
		<p class="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Recorded {formAny.recorded} counts.</p>
	{/if}
	{#if formAny?.posted}
		<p class="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Variances posted as adjustments. IA002 alerts (if any) are surfaced in the movements view.</p>
	{/if}
	{#if formAny?.cancelled}
		<p class="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">Session cancelled.</p>
	{/if}
	{#if formAny?.documentAttached}
		<p class="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Signed count document attached{formAny.fileName ? ` — ${formAny.fileName}` : ''}. IA002 alerts will be suppressed when posting variances.</p>
	{/if}

	<div class="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm md:grid-cols-3">
		<div class="md:col-span-2">
			<div class="text-xs uppercase text-slate-500">Signed physical-count document</div>
			{#if uploadedDoc}
				<div class="flex flex-wrap items-center gap-2">
					<a class="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700" href={`/api/inventory/cycle-counts/${s.id}/document`} target="_blank" rel="noopener">View</a>
					<a class="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50" href={`/api/inventory/cycle-counts/${s.id}/document?download=1`}>Download</a>
					<span class="font-mono text-xs text-slate-600">{uploadedFileName}</span>
				</div>
				<div class="text-xs text-emerald-700 mt-1">Signed count doc on file — IA002 alerts suppressed when posting.</div>
			{:else if docRef}
				<div class="font-mono text-xs">{docRef}</div>
				<div class="text-xs text-emerald-700 mt-1">Manual reference recorded — IA002 alerts suppressed when posting.</div>
			{:else}
				<div class="font-mono text-xs text-slate-500">— none attached —</div>
				<div class="text-xs text-amber-700 mt-1">No signed count doc. Variances &gt; SGD 10k will trigger IA002 when posting.</div>
			{/if}
			{#if editable}
				<form method="POST" action="?/attachDocument" enctype="multipart/form-data" use:enhance class="mt-3 flex flex-wrap items-center gap-2">
					<input type="file" name="file" accept=".pdf,image/*" class="text-xs" />
					<span class="text-[10px] uppercase text-slate-500">or</span>
					<input name="documentRef" placeholder="Manual reference (file id / URL)" class="rounded-md border border-slate-300 px-2 py-1 text-xs" />
					<button class="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700">{docRef ? 'Replace' : 'Attach'}</button>
				</form>
			{/if}
		</div>
		<div>
			<div class="text-xs uppercase text-slate-500">Counted at</div>
			<div>{s.countedAt ?? '—'}</div>
			<div class="text-xs uppercase text-slate-500 mt-2">Posted at</div>
			<div>{s.postedAt ?? '—'}</div>
			{#if s.approvedByEmail}
				<div class="text-xs text-slate-500">by {s.approvedByEmail}</div>
			{/if}
		</div>
	</div>

	<form method="POST" action="?/record" use:enhance>
		<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
			<table class="min-w-full divide-y divide-slate-200 text-sm">
				<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
					<tr>
						<th class="px-3 py-3">Item</th>
						<th class="px-3 py-3">Bin</th>
						<th class="px-3 py-3 text-right">Expected</th>
						<th class="px-3 py-3 text-right">Counted</th>
						<th class="px-3 py-3 text-right">Variance</th>
						<th class="px-3 py-3 text-right">Δ value</th>
						<th class="px-3 py-3">Notes</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					{#if data.lines.length === 0}
						<tr><td colspan="7" class="px-4 py-8 text-center text-slate-500">No lines snapshot. Verify warehouse has stock.</td></tr>
					{:else}
						{#each data.lines as line}
							<tr>
								<td class="px-3 py-2 text-xs">
									<div class="font-mono">{line.item?.code ?? line.itemId}</div>
									<div class="text-slate-500">{line.item?.name ?? ''}</div>
								</td>
								<td class="px-3 py-2 text-xs font-mono">{line.bin?.code ?? line.binLocationId}</td>
								<td class="px-3 py-2 text-right font-mono text-xs">{Number(line.expectedQuantity).toFixed(2)}</td>
								<td class="px-3 py-2 text-right">
									{#if editable}
										<input type="hidden" name="line_id" value={line.id} />
										<input
											name="counted_qty"
											type="number"
											step="any"
											min="0"
											value={line.countedQuantity ?? ''}
											class="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
										/>
									{:else}
										<span class="font-mono text-xs">{line.countedQuantity ?? '—'}</span>
									{/if}
								</td>
								<td class="px-3 py-2 text-right font-mono text-xs"
									class:text-emerald-700={Number(line.variance) > 0}
									class:text-rose-700={Number(line.variance) < 0}>
									{line.variance != null ? (Number(line.variance) >= 0 ? '+' : '') + Number(line.variance).toFixed(2) : '—'}
								</td>
								<td class="px-3 py-2 text-right font-mono text-xs">{line.varianceValue != null ? Number(line.varianceValue).toFixed(2) : '—'}</td>
								<td class="px-3 py-2 text-xs">
									{#if editable}
										<input name="line_notes" value={line.notes ?? ''} class="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
									{:else}
										{line.notes ?? '—'}
									{/if}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

		{#if editable}
			<div class="mt-3 text-right">
				<button class="rounded-md bg-[var(--sf-green)] px-3 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]">Save counts</button>
			</div>
		{/if}
	</form>
</PageShell>
