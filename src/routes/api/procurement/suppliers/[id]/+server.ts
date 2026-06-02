import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { createProcurementApi } from '$modules/procurement';
import { NotFoundError } from '$platform/modules/errors';

export const GET: RequestHandler = async (event) => {
	if (!event.platform) throw error(503, 'Platform unavailable');
	const { id } = event.params;
	const ctx = await createModuleContext(event);
	const procurement = createProcurementApi(ctx);
	try {
		const detail = await procurement.getSupplierDetail(id);
		return json(detail);
	} catch (err) {
		if (err instanceof NotFoundError) throw error(404, 'Supplier not found');
		throw error(500, 'Failed to load supplier');
	}
};

export const DELETE: RequestHandler = async (event) => {
	if (!event.platform) throw error(503, 'Platform unavailable');
	const { id } = event.params;
	const ctx = await createModuleContext(event);
	const procurement = createProcurementApi(ctx);
	try {
		await procurement.deleteSupplier(id);
		return json({ ok: true });
	} catch (err) {
		if (err instanceof NotFoundError) throw error(404, 'Supplier not found');
		throw error(500, 'Failed to delete supplier');
	}
};
