<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import ItemForm from '../ItemForm.svelte';

	let { data, form } = $props();
	const formAny = $derived(form as { message?: string; values?: any } | null | undefined);
</script>

<PageShell
	eyebrow="Inventory"
	title="New item"
	description="Create an item master record. Item code must be unique. Attach images, datasheets, and primary barcode here."
>
	<ItemForm
		suppliers={data.suppliers}
		message={formAny?.message ?? null}
		initial={formAny?.values ?? {}}
		submitLabel="Create item"
	/>
</PageShell>
