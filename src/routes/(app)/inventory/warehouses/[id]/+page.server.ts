import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { createInventoryApi } from '$modules/inventory';
import { createModuleContext } from '$platform/modules';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) throw error(503, 'Platform unavailable');
	const ctx = await createModuleContext(event);
	const inventory = createInventoryApi(ctx);
	try {
		const detail = await inventory.getWarehouseDetail(event.params.id!);
		const stock = await inventory.listStockLevels({ warehouseId: event.params.id! });
		return {
			warehouse: detail.warehouse,
			bins: detail.bins,
			stockLevels: stock
		};
	} catch (e) {
		if ((e as { code?: string }).code === 'NOT_FOUND') throw error(404, 'Warehouse not found');
		throw e;
	}
};

export const actions: Actions = {
	updateWarehouse: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		const data = await event.request.formData();
		const get = (k: string) => (data.get(k) as string | null)?.trim() || undefined;
		try {
			const ctx = await createModuleContext(event);
			const inventory = createInventoryApi(ctx);
			await inventory.updateWarehouse(event.params.id!, {
				code: get('code') ?? '',
				name: get('name') ?? '',
				status: (get('status') as any) || 'active',
				addressLine1: get('addressLine1'),
				addressLine2: get('addressLine2'),
				city: get('city'),
				state: get('state'),
				postalCode: get('postalCode'),
				country: get('country'),
				contactName: get('contactName'),
				contactPhone: get('contactPhone'),
				contactEmail: get('contactEmail'),
				notes: get('notes')
			});
			return { savedWarehouse: true };
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
	},

	createBin: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		const data = await event.request.formData();
		const get = (k: string) => (data.get(k) as string | null)?.trim() || undefined;
		try {
			const ctx = await createModuleContext(event);
			const inventory = createInventoryApi(ctx);
			await inventory.createBin({
				warehouseId: event.params.id!,
				code: get('code') ?? '',
				name: get('name'),
				locationType: (get('locationType') as any) || 'general',
				aisle: get('aisle'),
				rack: get('rack'),
				shelf: get('shelf'),
				bin: get('bin'),
				barcode: get('barcode'),
				isPickable: data.get('isPickable') === 'on',
				isReceivable: data.get('isReceivable') === 'on',
				isDefaultPutaway: data.get('isDefaultPutaway') === 'on',
				status: 'active',
				notes: get('notes')
			});
			return { savedBin: true };
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
	},

	deleteBin: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		const data = await event.request.formData();
		const id = data.get('binId');
		if (typeof id !== 'string') return fail(400, { message: 'Missing binId' });
		try {
			const ctx = await createModuleContext(event);
			const inventory = createInventoryApi(ctx);
			await inventory.deleteBin(id);
			return { deletedBin: true };
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
	},

	deleteWarehouse: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		await inventory.deleteWarehouse(event.params.id!);
		throw redirect(303, '/inventory/warehouses');
	}
};
