<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	let { data } = $props();
</script>

<PageShell
	eyebrow="Inventory"
	title="Cycle counts"
	description="Run cycle counts or full physical inventory. Each session snapshots expected on-hand, captures counted quantity, then posts variances as adjustments through the audit trail."
>
	<div class="mb-4 flex gap-3">
		<a class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" href="/inventory/cycle-counts/new">
			New cycle count
		</a>
		<a class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/inventory/movements?alertCode=IA002">View IA002 alerts</a>
	</div>

	<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
		<table class="min-w-full divide-y divide-slate-200 text-sm">
			<thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
				<tr>
					<th class="px-4 py-3">Count #</th>
					<th class="px-4 py-3">Warehouse</th>
					<th class="px-4 py-3">Type</th>
					<th class="px-4 py-3">Status</th>
					<th class="px-4 py-3">Scheduled</th>
					<th class="px-4 py-3">Counted</th>
					<th class="px-4 py-3">Posted</th>
					<th class="px-4 py-3">Document</th>
					<th class="px-4 py-3"></th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#if data.counts.length === 0}
					<tr><td colspan="9" class="px-4 py-8 text-center text-slate-500">No cycle counts yet.</td></tr>
				{:else}
					{#each data.counts as c}
						{@const wh = data.warehousesById[c.warehouseId]}
						<tr>
							<td class="px-4 py-3 font-mono text-xs">
								<a href={`/inventory/cycle-counts/${c.id}`} class="hover:text-[var(--sf-green)] hover:underline">{c.countNumber}</a>
							</td>
							<td class="px-4 py-3 text-xs">{wh ? `${wh.code} — ${wh.name}` : c.warehouseId}</td>
							<td class="px-4 py-3 text-xs capitalize">{c.countType.replace('_', ' ')}</td>
							<td class="px-4 py-3 text-xs capitalize">
								<span class="rounded-full bg-slate-100 px-2 py-1">{c.status}</span>
							</td>
							<td class="px-4 py-3 text-xs text-slate-500">{c.scheduledAt ?? '—'}</td>
							<td class="px-4 py-3 text-xs text-slate-500">{c.countedAt ?? '—'}</td>
							<td class="px-4 py-3 text-xs text-slate-500">{c.postedAt ?? '—'}</td>
							<td class="px-4 py-3 text-xs">{c.documentRef ?? '—'}</td>
							<td class="px-4 py-3 text-right">
								<a class="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" href={`/inventory/cycle-counts/${c.id}`}>Open</a>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</PageShell>
