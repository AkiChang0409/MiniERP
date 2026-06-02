import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { createInventoryApi } from '$modules/inventory';
import { createModuleContext } from '$platform/modules';

export const actions: Actions = {
	default: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		const data = await event.request.formData();
		const get = (k: string) => (data.get(k) as string | null)?.trim() || undefined;
		const payload = {
			code: get('code') ?? '',
			name: get('name') ?? '',
			status: (get('status') as any) || 'active',
			addressLine1: get('addressLine1'),
			addressLine2: get('addressLine2'),
			city: get('city'),
			state: get('state'),
			postalCode: get('postalCode'),
			country: get('country') || 'Singapore',
			contactName: get('contactName'),
			contactPhone: get('contactPhone'),
			contactEmail: get('contactEmail'),
			notes: get('notes')
		};
		if (!payload.code || !payload.name) {
			return fail(400, { message: 'Code and name are required', values: payload });
		}
		try {
			const ctx = await createModuleContext(event);
			const inventory = createInventoryApi(ctx);
			const { id } = await inventory.createWarehouse(payload);
			throw redirect(303, `/inventory/warehouses/${id}`);
		} catch (e) {
			if (e instanceof Response) throw e;
			return fail(400, { message: (e as Error).message, values: payload });
		}
	}
};
