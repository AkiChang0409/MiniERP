<script lang="ts">
	/**
	 * Read-only renderer for the generic `line_items` array stored in an
	 * expense/revenue `metadata` JSON column (or an archive `extracted` blob).
	 * Shared by the finance detail pages. Renders nothing when there are no
	 * items, so callers can drop it in unconditionally.
	 *
	 * Accepts the raw value (array of loosely-typed objects) and tolerates the
	 * key aliases the extractor / editor may have produced.
	 */
	type Row = {
		description: string | null;
		qty: number | null;
		unit: string | null;
		unitPrice: number | null;
		amount: number | null;
		sku: string | null;
		taxRate: number | null;
	};

	let {
		items,
		currency = 'SGD',
		title = 'Line items'
	}: { items?: unknown; currency?: string; title?: string } = $props();

	const toNum = (v: unknown): number | null => {
		if (typeof v === 'number' && Number.isFinite(v)) return v;
		if (typeof v === 'string') {
			const cleaned = v.replace(/[,$€£¥₹\s]/g, '').trim();
			if (!cleaned) return null;
			const n = Number(cleaned);
			return Number.isFinite(n) ? n : null;
		}
		return null;
	};
	const toStr = (v: unknown): string | null => {
		if (v === null || v === undefined) return null;
		const s = String(v).trim();
		return s ? s : null;
	};

	function normalize(raw: unknown): Row[] {
		if (!Array.isArray(raw)) return [];
		return raw
			.map((entry) => {
				const o = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
				return {
					description: toStr(o.description ?? o.desc ?? o.name ?? o.item),
					qty: toNum(o.qty ?? o.quantity),
					unit: toStr(o.unit ?? o.uom),
					unitPrice: toNum(o.unitPrice ?? o.unit_price ?? o.price),
					amount: toNum(o.amount ?? o.total ?? o.lineTotal),
					sku: toStr(o.sku ?? o.code ?? o.productCode),
					taxRate: toNum(o.taxRate ?? o.tax_rate ?? o.tax)
				};
			})
			.filter((r) => Object.values(r).some((v) => v !== null));
	}

	const rows = $derived(normalize(items));
	// Only show optional columns when at least one row populates them.
	const showUnit = $derived(rows.some((r) => r.unit !== null));
	const showSku = $derived(rows.some((r) => r.sku !== null));
	const showTax = $derived(rows.some((r) => r.taxRate !== null));

	const money = (v: number | null) =>
		v === null
			? '—'
			: new Intl.NumberFormat('en-SG', { style: 'currency', currency: currency || 'SGD' }).format(v);
	const numText = (v: number | null) => (v === null ? '—' : String(v));
	const text = (v: string | null) => v ?? '—';
</script>

{#if rows.length > 0}
	<section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
		<div class="border-b border-slate-200 px-5 py-3">
			<h3 class="text-[13px] font-medium text-slate-900">{title} ({rows.length})</h3>
			<p class="mt-0.5 text-xs text-slate-500">Itemised goods / services extracted from the document.</p>
		</div>
		<div class="overflow-x-auto px-5 py-4">
			<table class="w-full min-w-[520px] border-collapse text-sm">
				<thead>
					<tr class="text-left text-[11px] uppercase tracking-wide text-slate-400">
						<th class="py-1 pr-3 font-medium">Description</th>
						{#if showSku}<th class="py-1 px-3 font-medium">SKU</th>{/if}
						<th class="py-1 px-3 text-right font-medium">Qty</th>
						{#if showUnit}<th class="py-1 px-3 font-medium">Unit</th>{/if}
						<th class="py-1 px-3 text-right font-medium">Unit price</th>
						{#if showTax}<th class="py-1 px-3 text-right font-medium">Tax %</th>{/if}
						<th class="py-1 pl-3 text-right font-medium">Amount</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row)}
						<tr class="border-t border-slate-100 align-top">
							<td class="py-1.5 pr-3 text-slate-800">{text(row.description)}</td>
							{#if showSku}<td class="py-1.5 px-3 font-mono text-xs text-slate-600">{text(row.sku)}</td>{/if}
							<td class="py-1.5 px-3 text-right tabular-nums text-slate-700">{numText(row.qty)}</td>
							{#if showUnit}<td class="py-1.5 px-3 text-slate-600">{text(row.unit)}</td>{/if}
							<td class="py-1.5 px-3 text-right tabular-nums text-slate-700">{money(row.unitPrice)}</td>
							{#if showTax}<td class="py-1.5 px-3 text-right tabular-nums text-slate-600">{numText(row.taxRate)}</td>{/if}
							<td class="py-1.5 pl-3 text-right font-medium tabular-nums text-slate-900">{money(row.amount)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{/if}
