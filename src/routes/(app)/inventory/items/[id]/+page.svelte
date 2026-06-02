<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import ItemForm from '../ItemForm.svelte';

	let { data, form } = $props();
	const formAny = $derived(form as { message?: string; values?: any; success?: boolean } | null | undefined);

	let pendingDelete = $state(false);

	const initial = $derived(
		formAny?.values ?? {
			code: data.item.code,
			name: data.item.name,
			description: data.item.description ?? '',
			itemType: data.item.itemType,
			status: data.item.status,
			category: data.item.category ?? '',
			uom: data.item.uom,
			uomCategory: data.item.uomCategory ?? '',
			preferredSupplierId: data.item.preferredSupplierId ?? '',
			reorderPoint: data.item.reorderPoint,
			minLevel: data.item.minLevel,
			maxLevel: data.item.maxLevel,
			leadTimeDays: data.item.leadTimeDays,
			lotControl: !!data.item.lotControl,
			serialControl: !!data.item.serialControl,
			shelfLifeDays: data.item.shelfLifeDays,
			valuationMethod: data.item.valuationMethod,
			standardCost: data.item.standardCost,
			lastCost: data.item.lastCost,
			averageCost: data.item.averageCost,
			currency: data.item.currency,
			primaryImageUrl: data.item.primaryImageUrl ?? '',
			notes: data.item.notes ?? '',
			barcodes: data.barcodes,
			attachments: data.attachments
		}
	);
</script>

<PageShell
	eyebrow="Inventory"
	title={`${data.item.code} — ${data.item.name}`}
	description="Edit item master attributes, valuation, barcodes, and attachments."
>
	<div class="mb-4 flex flex-wrap items-center gap-3">
		<a class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/inventory/items">
			Back to items
		</a>
		{#if pendingDelete}
			<form method="POST" action="?/delete" class="flex items-center gap-2">
				<span class="text-sm text-rose-700">Confirm permanent removal?</span>
				<button type="submit" class="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">
					Yes, delete
				</button>
				<button type="button" onclick={() => (pendingDelete = false)} class="rounded-md border border-slate-300 px-3 py-1.5 text-xs">
					Cancel
				</button>
			</form>
		{:else}
			<button type="button" onclick={() => (pendingDelete = true)} class="rounded-md border border-rose-300 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
				Delete item
			</button>
		{/if}
	</div>

	{#if formAny?.success}
		<p class="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Saved.</p>
	{/if}

	<ItemForm
		suppliers={data.suppliers}
		message={formAny?.message ?? null}
		initial={initial}
		submitLabel="Save changes"
		action="?/update"
	/>
</PageShell>
