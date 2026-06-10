export type InvoiceLineRow = { desc: string; qty: number; price: number };

export function parseStoredInvoiceLineItems(raw: string | null): {
	lines: InvoiceLineRow[];
	generator?: Record<string, unknown>;
} {
	if (!raw) return { lines: [] };
	try {
		const j = JSON.parse(raw) as unknown;
		if (Array.isArray(j)) {
			return { lines: j.map(normalizeRow).filter((r): r is InvoiceLineRow => r !== null) };
		}
		if (j && typeof j === 'object' && 'lines' in j && Array.isArray((j as { lines: unknown }).lines)) {
			const o = j as { lines: unknown[]; generator?: Record<string, unknown> };
			return {
				lines: o.lines.map(normalizeRow).filter((r): r is InvoiceLineRow => r !== null),
				generator: o.generator
			};
		}
		return { lines: [] };
	} catch {
		return { lines: [] };
	}
}

function normalizeRow(r: unknown): InvoiceLineRow | null {
	if (!r || typeof r !== 'object') return null;
	const o = r as Record<string, unknown>;
	const desc = typeof o.desc === 'string' ? o.desc : '';
	const qty = coerceNum(o.qty);
	const price = coerceNum(o.price);
	return { desc, qty, price };
}

function coerceNum(v: unknown): number {
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	const n = Number.parseFloat(String(v ?? 0));
	return Number.isFinite(n) ? n : 0;
}
