<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { goto } from '$app/navigation';

	type ScanHit = {
		item: { id: string; code: string; name: string; uom: string; itemType: string };
		barcode: { barcodeValue: string; barcodeType: string; packagingLevel: string } | null;
	};

	let value = $state('');
	let history = $state<ScanHit[]>([]);
	let error = $state<string | null>(null);
	let busy = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		const v = value.trim();
		if (!v) return;
		busy = true;
		try {
			const res = await fetch(`/api/inventory/barcode-lookup?value=${encodeURIComponent(v)}`);
			const json = (await res.json()) as { ok?: boolean; data?: ScanHit };
			if (!res.ok || !json.data) {
				error = `No item matched "${v}"`;
				value = '';
				return;
			}
			history = [json.data, ...history].slice(0, 20);
			value = '';
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<PageShell
	eyebrow="Inventory"
	title="Barcode scanner"
	description="Hand-held USB barcode scanners act as keyboards. Click the input below, scan a code, and the matching item opens in a new row."
>
	<form class="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4" onsubmit={submit}>
		<label class="block space-y-1 text-sm">
			<span class="font-medium text-emerald-800">Scan or paste a barcode</span>
			<input
				bind:value
				class="w-full rounded-md border border-emerald-300 px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-emerald-500"
				placeholder="Click here, then scan or type, then press Enter"
				autocomplete="off"
				autofocus
			/>
		</label>
		<div class="mt-2 flex items-center gap-2">
			<button
				type="submit"
				disabled={busy}
				class="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
			>
				{busy ? 'Looking up…' : 'Look up'}
			</button>
			{#if error}<span class="text-sm text-rose-600">{error}</span>{/if}
		</div>
	</form>

	{#if history.length === 0}
		<p class="mt-6 text-sm text-slate-500">No scans yet. Results appear here.</p>
	{:else}
		<div class="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
			<table class="min-w-full divide-y divide-slate-200 text-sm">
				<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
					<tr>
						<th class="px-4 py-3">Scanned value</th>
						<th class="px-4 py-3">Item code</th>
						<th class="px-4 py-3">Name</th>
						<th class="px-4 py-3">Type / UoM</th>
						<th class="px-4 py-3">Barcode symbology</th>
						<th class="px-4 py-3"></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					{#each history as hit}
						<tr>
							<td class="px-4 py-3 font-mono text-xs">{hit.barcode?.barcodeValue ?? hit.item.code}</td>
							<td class="px-4 py-3 font-mono text-xs">{hit.item.code}</td>
							<td class="px-4 py-3">{hit.item.name}</td>
							<td class="px-4 py-3 text-slate-600 capitalize">
								{hit.item.itemType.replace('_', ' ')} · {hit.item.uom}
							</td>
							<td class="px-4 py-3 text-slate-600 text-xs">{hit.barcode?.barcodeType ?? 'item code match'}</td>
							<td class="px-4 py-3 text-right">
								<button
									type="button"
									class="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
									onclick={() => goto(`/inventory/items/${hit.item.id}`)}
								>
									Open
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</PageShell>
