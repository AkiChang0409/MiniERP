import type { PageServerLoad, Actions } from './$types';

import { createInventoryApi } from '$modules/inventory';
import { createModuleContext } from '$platform/modules';
import { createProcurementApi } from '$modules/procurement';
import { fail, redirect } from '@sveltejs/kit';
import { parseItemFormData } from '../form-utils';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		return { suppliers: [] as Array<{ id: string; name: string }> };
	}
	const ctx = await createModuleContext(event);
	const procurement = createProcurementApi(ctx);
	const suppliers = await procurement.listSuppliers();
	return {
		suppliers: suppliers.map((s) => ({ id: s.id, name: s.name }))
	};
};

export const actions: Actions = {
	default: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		const data = await event.request.formData();
		const payload = parseItemFormData(data);
		if (!payload.code || !payload.name) {
			return fail(400, { message: 'Code and name are required', values: payload });
		}
		try {
			const ctx = await createModuleContext(event);
			const inventory = createInventoryApi(ctx);
			const { id } = await inventory.createItem(payload);
			throw redirect(303, `/inventory/items/${id}`);
		} catch (e) {
			if (e instanceof Response) throw e;
			const message = (e as Error).message ?? 'Failed to create item';
			return fail(400, { message, values: payload });
		}
	}
};
