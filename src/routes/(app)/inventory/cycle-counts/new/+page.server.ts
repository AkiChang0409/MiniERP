import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { createInventoryApi } from '$modules/inventory';
import { createModuleContext } from '$platform/modules';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) return { warehouses: [], binsByWarehouse: {} };
	const ctx = await createModuleContext(event);
	const inventory = createInventoryApi(ctx);
	const warehouses = await inventory.listWarehouses();
	const binsByWarehouse: Record<string, Array<{ id: string; code: string; locationType: string }>> = {};
	for (const w of warehouses) {
		const bins = await inventory.listBinsForWarehouse(w.id);
		binsByWarehouse[w.id] = bins.map((b) => ({ id: b.id, code: b.code, locationType: b.locationType }));
	}
	return {
		warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name })),
		binsByWarehouse
	};
};

export const actions: Actions = {
	default: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		const data = await event.request.formData();
		const warehouseId = data.get('warehouseId');
		if (typeof warehouseId !== 'string' || !warehouseId) {
			return fail(400, { message: 'Warehouse is required' });
		}
		const countType = (data.get('countType') as string) || 'cycle_count';
		const manualRef = (data.get('documentRef') as string | null)?.trim() || undefined;
		const notes = (data.get('notes') as string | null)?.trim() || undefined;
		const binIds = data.getAll('binIds').map((v) => String(v)).filter(Boolean);
		const uploadedFile = data.get('file');
		try {
			const ctx = await createModuleContext(event);
			const inventory = createInventoryApi(ctx);
			const { id } = await inventory.createCycleCount({
				warehouseId,
				countType: countType as any,
				documentRef: manualRef,
				notes,
				binIds: binIds.length > 0 ? binIds : undefined
			});
			// If the user picked a file at creation time, upload now and attach.
			if (uploadedFile instanceof File && uploadedFile.size > 0) {
				const safeName = uploadedFile.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'signed-count.pdf';
				const key = `cycle-counts/${id}/${Date.now()}-${safeName}`;
				await event.platform.env.R2.put(key, await uploadedFile.arrayBuffer(), {
					httpMetadata: { contentType: uploadedFile.type || 'application/octet-stream' }
				});
				await inventory.attachCycleCountDocument(id, {
					documentRef: `r2:${key}`,
					fileName: uploadedFile.name,
					contentType: uploadedFile.type || 'application/octet-stream',
					sizeBytes: uploadedFile.size
				});
			}
			throw redirect(303, `/inventory/cycle-counts/${id}`);
		} catch (e) {
			if (e instanceof Response) throw e;
			return fail(400, { message: (e as Error).message });
		}
	}
};
