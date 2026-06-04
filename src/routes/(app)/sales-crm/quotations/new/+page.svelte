<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import SalesSubNav from '$app-layer/components/sales-crm/SalesSubNav.svelte';

	let { data, form } = $props();

	type Line = { itemCode: string; description: string; quantity: number; unitPrice: number; discountPct: number };
	const emptyLine = (): Line => ({ itemCode: '', description: '', quantity: 1, unitPrice: 0, discountPct: 0 });
	let lines = $state<Line[]>([emptyLine()]);

	const serializedLines = $derived(JSON.stringify(lines));
	const inputClass =
		'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]';
</script>

<PageShell eyebrow="Sales & CRM" title="New quotation" description="Draft a customer quote; convert it to a sales order once accepted.">
	<SalesSubNav />

	<form method="POST" class="space-y-5">
		{#if form?.message}<p class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{form.message}</p>{/if}

		<div class="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3">
			<label class="space-y-1 text-sm"><span class="text-slate-700">Customer</span>
				<select name="customerId" required class={inputClass}>
					<option value="">Select customer…</option>
					{#each data.customers as c}<option value={c.id}>{c.name}</option>{/each}
				</select></label>
			<label class="space-y-1 text-sm"><span class="text-slate-700">Quote date</span><input name="quoteDate" type="date" class={inputClass} /></label>
			<label class="space-y-1 text-sm"><span class="text-slate-700">Valid until</span><input name="validUntil" type="date" class={inputClass} /></label>
		</div>

		<div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
			<div class="mb-3 flex items-center justify-between">
				<h3 class="text-sm font-semibold text-slate-800">Line items</h3>
				<button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50" onclick={() => (lines = [...lines, emptyLine()])}>+ Add line</button>
			</div>
			<div class="space-y-3">
				{#each lines as line, i}
					<div class="grid gap-2 rounded-lg border border-slate-100 p-3 md:grid-cols-12">
						<label class="space-y-1 text-xs md:col-span-2"><span class="text-slate-500">Item code</span><input bind:value={line.itemCode} class={inputClass} /></label>
						<label class="space-y-1 text-xs md:col-span-5"><span class="text-slate-500">Description</span><input bind:value={line.description} class={inputClass} /></label>
						<label class="space-y-1 text-xs md:col-span-1"><span class="text-slate-500">Qty</span><input type="number" step="0.01" bind:value={line.quantity} class={inputClass} /></label>
						<label class="space-y-1 text-xs md:col-span-2"><span class="text-slate-500">Unit price</span><input type="number" step="0.01" bind:value={line.unitPrice} class={inputClass} /></label>
						<label class="space-y-1 text-xs md:col-span-1"><span class="text-slate-500">Disc %</span><input type="number" step="0.01" bind:value={line.discountPct} class={inputClass} /></label>
						<div class="flex items-end md:col-span-1"><button type="button" class="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50" onclick={() => (lines = lines.filter((_, j) => j !== i))}>×</button></div>
					</div>
				{/each}
			</div>
		</div>

		<div class="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3">
			<label class="space-y-1 text-sm"><span class="text-slate-700">Header discount %</span><input name="discountPct" type="number" step="0.01" value="0" class={inputClass} /></label>
			<label class="space-y-1 text-sm"><span class="text-slate-700">Tax amount</span><input name="taxAmount" type="number" step="0.01" value="0" class={inputClass} /></label>
			<label class="space-y-1 text-sm"><span class="text-slate-700">Tax code</span>
				<select name="taxCode" class={inputClass}><option value="">—</option><option>SR</option><option>ZR</option><option>ES</option><option>OP</option></select></label>
		</div>

		<textarea name="notes" rows="2" placeholder="Notes (optional)" class="{inputClass} max-w-xl"></textarea>
		<input type="hidden" name="lines" value={serializedLines} />

		<div class="flex gap-3">
			<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" type="submit">Create quotation</button>
			<a class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/sales-crm/quotations">Cancel</a>
		</div>
	</form>
</PageShell>
