<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import SalesSubNav from '$app-layer/components/sales-crm/SalesSubNav.svelte';

	let { data, form } = $props();

	type Line = {
		cellKey: string;
		itemId: string;
		itemCode: string;
		warehouseId: string;
		binLocationId: string;
		description: string;
		quantity: number;
		unitPrice: number;
		discountPct: number;
	};

	function emptyLine(): Line {
		return {
			cellKey: '',
			itemId: '',
			itemCode: '',
			warehouseId: '',
			binLocationId: '',
			description: '',
			quantity: 1,
			unitPrice: 0,
			discountPct: 0
		};
	}

	let lines = $state<Line[]>([emptyLine()]);
	let discountPct = $state(0);

	const cellByKey = $derived(
		new Map(data.stockCells.map((c: any) => [`${c.itemId}|${c.warehouseId}|${c.binLocationId}`, c]))
	);

	function onPickCell(line: Line) {
		const cell: any = cellByKey.get(line.cellKey);
		if (!cell) {
			line.itemId = '';
			line.warehouseId = '';
			line.binLocationId = '';
			return;
		}
		line.itemId = cell.itemId;
		line.itemCode = cell.itemCode ?? '';
		line.warehouseId = cell.warehouseId;
		line.binLocationId = cell.binLocationId;
		if (!line.description) line.description = cell.itemName;
		if (!line.unitPrice && cell.unitPrice) line.unitPrice = cell.unitPrice;
	}

	const grossSubtotal = $derived(
		lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0)
	);
	const lineDiscounted = $derived(
		lines.reduce(
			(s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0) * (1 - Number(l.discountPct || 0) / 100),
			0
		)
	);
	const headerDiscountAmt = $derived(lineDiscounted * (Number(discountPct || 0) / 100));
	const totalDiscount = $derived(grossSubtotal - lineDiscounted + headerDiscountAmt);
	const overallPct = $derived(grossSubtotal > 0 ? (totalDiscount / grossSubtotal) * 100 : 0);
	const willFlagIa002 = $derived(overallPct > 20);

	const serializedLines = $derived(JSON.stringify(lines));
	const inputClass =
		'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]';
</script>

<PageShell eyebrow="Sales & CRM" title="New sales order" description="Pick stock cells to see available-to-promise; discounts over 20% require director approval (IA002).">
	<SalesSubNav />

	<form method="POST" class="space-y-5">
		{#if form?.message}
			<p class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{form.message}</p>
		{/if}

		<div class="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
			<label class="space-y-1 text-sm"><span class="text-slate-700">Customer</span>
				<select name="customerId" required class={inputClass}>
					<option value="">Select customer…</option>
					{#each data.customers as c}<option value={c.id}>{c.name}</option>{/each}
				</select></label>
			<label class="space-y-1 text-sm"><span class="text-slate-700">Order date</span>
				<input name="orderDate" type="date" class={inputClass} /></label>
			<label class="space-y-1 text-sm"><span class="text-slate-700">Requested delivery</span>
				<input name="requestedDeliveryDate" type="date" class={inputClass} /></label>
			<label class="space-y-1 text-sm"><span class="text-slate-700">Tax code</span>
				<select name="taxCode" class={inputClass}>
					<option value="">—</option><option>SR</option><option>ZR</option><option>ES</option><option>OP</option>
				</select></label>
			<label class="space-y-1 text-sm"><span class="text-slate-700">Shipping address</span>
				<textarea name="shippingAddress" rows="2" class={inputClass}></textarea></label>
			<label class="space-y-1 text-sm"><span class="text-slate-700">Billing address</span>
				<textarea name="billingAddress" rows="2" class={inputClass}></textarea></label>
		</div>

		<div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
			<div class="mb-3 flex items-center justify-between">
				<h3 class="text-sm font-semibold text-slate-800">Line items</h3>
				<button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50" onclick={() => (lines = [...lines, emptyLine()])}>+ Add line</button>
			</div>
			<div class="space-y-3">
				{#each lines as line, i}
					<div class="grid gap-2 rounded-lg border border-slate-100 p-3 md:grid-cols-12">
						<label class="space-y-1 text-xs md:col-span-4"><span class="text-slate-500">Stock cell (ATP)</span>
							<select bind:value={line.cellKey} onchange={() => onPickCell(line)} class={inputClass}>
								<option value="">Non-stock / custom line</option>
								{#each data.stockCells as cell}
									<option value={`${cell.itemId}|${cell.warehouseId}|${cell.binLocationId}`}>
										{cell.itemName} @ {cell.warehouseName}/{cell.binCode} · ATP {cell.available}
									</option>
								{/each}
							</select></label>
						<label class="space-y-1 text-xs md:col-span-3"><span class="text-slate-500">Description</span>
							<input bind:value={line.description} class={inputClass} /></label>
						<label class="space-y-1 text-xs md:col-span-1"><span class="text-slate-500">Qty</span>
							<input type="number" step="0.01" min="0" bind:value={line.quantity} class={inputClass} /></label>
						<label class="space-y-1 text-xs md:col-span-2"><span class="text-slate-500">Unit price</span>
							<input type="number" step="0.01" min="0" bind:value={line.unitPrice} class={inputClass} /></label>
						<label class="space-y-1 text-xs md:col-span-1"><span class="text-slate-500">Disc %</span>
							<input type="number" step="0.01" min="0" bind:value={line.discountPct} class={inputClass} /></label>
						<div class="flex items-end md:col-span-1">
							<button type="button" class="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50" onclick={() => (lines = lines.filter((_, j) => j !== i))}>Remove</button>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-4">
			<label class="space-y-1 text-sm"><span class="text-slate-700">Header discount %</span>
				<input name="discountPct" type="number" step="0.01" min="0" bind:value={discountPct} class={inputClass} /></label>
			<label class="space-y-1 text-sm"><span class="text-slate-700">Shipping</span>
				<input name="shippingAmount" type="number" step="0.01" min="0" value="0" class={inputClass} /></label>
			<label class="space-y-1 text-sm"><span class="text-slate-700">Tax amount</span>
				<input name="taxAmount" type="number" step="0.01" min="0" value="0" class={inputClass} /></label>
			<div class="space-y-1 text-sm">
				<span class="text-slate-700">Overall discount</span>
				<div class="rounded-md bg-slate-50 px-3 py-1.5 text-sm {willFlagIa002 ? 'text-amber-700' : 'text-slate-700'}">
					{overallPct.toFixed(1)}%
				</div>
			</div>
		</div>

		{#if willFlagIa002}
			<p class="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
				<span class="font-semibold">IA002 — revenue risk.</span> Overall discount exceeds 20%; this order will be flagged and held for director approval before it can be confirmed.
			</p>
		{/if}

		<textarea name="notes" rows="2" placeholder="Notes (optional)" class="{inputClass} max-w-xl"></textarea>
		<input type="hidden" name="lines" value={serializedLines} />

		<div class="flex gap-3">
			<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" type="submit">Create order</button>
			<a class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/sales-crm/orders">Cancel</a>
		</div>
	</form>
</PageShell>
