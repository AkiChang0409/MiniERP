import type { PageServerLoad, Actions } from './$types';

import { createInventoryApi } from '$modules/inventory';
import { createModuleContext } from '$platform/modules';
import { fail } from '@sveltejs/kit';

type ItemRow = {
	id: string;
	code: string;
	name: string;
	itemType: string;
	status: string;
	uom: string;
	category: string | null;
	reorderPoint: number | null;
	minLevel: number | null;
	maxLevel: number | null;
	leadTimeDays: number | null;
	lotControl: boolean;
	serialControl: boolean;
	valuationMethod: string;
	standardCost: number | null;
	lastCost: number | null;
	currency: string;
	primaryImageUrl: string | null;
	primaryBarcodeValue: string | null;
	primaryBarcodeType: string | null;
	barcodes: Array<{
		id: string;
		barcodeValue: string;
		barcodeType: string;
		packagingLevel: string;
		isPrimary: boolean;
	}>;
};

export const load: PageServerLoad = async (event) => {
	const q = (event.url.searchParams.get('q') ?? '').trim().toLowerCase();
	const type = (event.url.searchParams.get('type') ?? '').trim();
	const status = (event.url.searchParams.get('status') ?? '').trim();

	if (!event.platform) {
		return {
			filters: { q, type, status },
			categoryOptions: [] as string[],
			items: [] as ItemRow[]
		};
	}

	const ctx = await createModuleContext(event);
	const inventory = createInventoryApi(ctx);
	const rows = await inventory.listItems();

	const normalized: ItemRow[] = rows.map((r: any) => ({
		id: r.id,
		code: r.code,
		name: r.name,
		itemType: r.itemType,
		status: r.status,
		uom: r.uom,
		category: r.category ?? null,
		reorderPoint: r.reorderPoint ?? null,
		minLevel: r.minLevel ?? null,
		maxLevel: r.maxLevel ?? null,
		leadTimeDays: r.leadTimeDays ?? null,
		lotControl: !!r.lotControl,
		serialControl: !!r.serialControl,
		valuationMethod: r.valuationMethod,
		standardCost: r.standardCost ?? null,
		lastCost: r.lastCost ?? null,
		currency: r.currency,
		primaryImageUrl: r.primaryImageUrl ?? null,
		primaryBarcodeValue: r.primaryBarcodeValue ?? null,
		primaryBarcodeType: r.primaryBarcodeType ?? null,
		barcodes: (r.barcodes ?? []).map((b: any) => ({
			id: b.id,
			barcodeValue: b.barcodeValue,
			barcodeType: b.barcodeType,
			packagingLevel: b.packagingLevel,
			isPrimary: !!b.isPrimary
		}))
	}));

	const categoryOptions = Array.from(
		new Set(normalized.map((r) => r.category?.trim() ?? '').filter((v) => v.length > 0))
	).sort((a, b) => a.localeCompare(b));

	const filtered = normalized.filter((item) => {
		if (type && item.itemType !== type) return false;
		if (status && item.status !== status) return false;
		if (!q) return true;
		const haystack = [
			item.code,
			item.name,
			item.category ?? '',
			item.itemType,
			item.uom,
			item.primaryBarcodeValue ?? '',
			...item.barcodes.map((b) => b.barcodeValue)
		]
			.join(' ')
			.toLowerCase();
		return haystack.includes(q);
	});

	return {
		filters: { q, type, status },
		categoryOptions,
		items: filtered
	};
};

export const actions: Actions = {
	delete: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const data = await event.request.formData();
		const id = data.get('id');
		if (!id || typeof id !== 'string') return fail(400, { error: 'Missing id' });
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		await inventory.deleteItem(id);
		return { success: true };
	}
};
