import type { PageServerLoad, Actions } from './$types';

import { createInventoryApi } from '$modules/inventory';
import { createModuleContext } from '$platform/modules';
import { createProcurementApi } from '$modules/procurement';
import { error, fail, redirect } from '@sveltejs/kit';
import { parseItemFormData } from '../form-utils';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) throw error(503, 'Platform unavailable');
	const ctx = await createModuleContext(event);
	const inventory = createInventoryApi(ctx);
	const procurement = createProcurementApi(ctx);

	try {
		const detail = await inventory.getItemDetail(event.params.id!);
		const suppliers = await procurement.listSuppliers();
		return {
			item: detail.item,
			barcodes: detail.barcodes.map((b: any) => ({
				barcodeValue: b.barcodeValue,
				barcodeType: b.barcodeType,
				packagingLevel: b.packagingLevel,
				isPrimary: !!b.isPrimary
			})),
			attachments: detail.attachments.map((a: any) => ({
				attachmentType: a.attachmentType,
				title: a.title,
				fileName: a.fileName ?? null,
				fileUrl: a.fileUrl ?? null,
				mimeType: a.mimeType ?? null,
				isPrimaryImage: !!a.isPrimaryImage
			})),
			suppliers: suppliers.map((s) => ({ id: s.id, name: s.name }))
		};
	} catch (e) {
		if ((e as { code?: string }).code === 'NOT_FOUND') {
			throw error(404, 'Item not found');
		}
		throw e;
	}
};

export const actions: Actions = {
	update: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		const data = await event.request.formData();
		const payload = parseItemFormData(data);
		if (!payload.code || !payload.name) {
			return fail(400, { message: 'Code and name are required', values: payload });
		}
		try {
			const ctx = await createModuleContext(event);
			const inventory = createInventoryApi(ctx);
			await inventory.updateItem(event.params.id!, payload);
			return { success: true };
		} catch (e) {
			return fail(400, { message: (e as Error).message, values: payload });
		}
	},

	delete: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		const ctx = await createModuleContext(event);
		const inventory = createInventoryApi(ctx);
		await inventory.deleteItem(event.params.id!);
		throw redirect(303, '/inventory/items');
	}
};
