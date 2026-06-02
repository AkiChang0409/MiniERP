import type { PageServerLoad } from './$types';
import { createInventoryApi } from '$modules/inventory';
import { createModuleContext } from '$platform/modules';

export const load: PageServerLoad = async (event) => {
	const warehouseId = event.url.searchParams.get('warehouseId') ?? undefined;
	const asOf = event.url.searchParams.get('asOf') ?? undefined;

	if (!event.platform) {
		return {
			filters: { warehouseId, asOf },
			report: { asOf: new Date().toISOString(), buckets: [], rows: [] as any[] },
			items: {} as Record<string, { code: string; name: string; uom: string }>,
			warehouses: [] as Array<{ id: string; code: string; name: string }>,
			warehousesById: {} as Record<string, { code: string; name: string }>,
			binsById: {} as Record<string, { code: string; locationType: string }>
		};
	}

	const ctx = await createModuleContext(event);
	const inventory = createInventoryApi(ctx);
	const [report, items, warehouses] = await Promise.all([
		inventory.getInventoryAging({ warehouseId, asOf }),
		inventory.listItems(),
		inventory.listWarehouses()
	]);

	const allBins = await Promise.all(
		warehouses.map((w) => inventory.listBinsForWarehouse(w.id))
	);
	const bins = allBins.flat();

	return {
		filters: { warehouseId, asOf },
		report,
		items: items.reduce<Record<string, { code: string; name: string; uom: string }>>((acc, i) => {
			acc[i.id] = { code: i.code, name: i.name, uom: i.uom };
			return acc;
		}, {}),
		warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name })),
		warehousesById: warehouses.reduce<Record<string, { code: string; name: string }>>((acc, w) => {
			acc[w.id] = { code: w.code, name: w.name };
			return acc;
		}, {}),
		binsById: bins.reduce<Record<string, { code: string; locationType: string }>>((acc, b) => {
			acc[b.id] = { code: b.code, locationType: b.locationType };
			return acc;
		}, {})
	};
};
