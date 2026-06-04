import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createModuleContext } from '$platform/modules';
import { createSalesCrmApi } from '$modules/sales-crm';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) return { customers: [] };
	const ctx = await createModuleContext(event);
	const salesCrm = createSalesCrmApi(ctx);
	return { customers: await salesCrm.listCustomerOptions() };
};

export const actions: Actions = {
	default: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		const f = await event.request.formData();
		const customerId = String(f.get('customerId') ?? '');
		if (!customerId) return fail(400, { message: 'Customer is required' });

		let lines: any[] = [];
		try {
			lines = JSON.parse(String(f.get('lines') ?? '[]'));
		} catch {
			return fail(400, { message: 'Invalid line items' });
		}
		lines = lines.filter((l) => l && String(l.description ?? '').trim());
		if (lines.length === 0) return fail(400, { message: 'At least one line item is required' });

		const ctx = await createModuleContext(event);
		const salesCrm = createSalesCrmApi(ctx);
		let id: string;
		try {
			const result = await salesCrm.createQuotation({
				customerId,
				quoteDate: String(f.get('quoteDate') ?? '') || undefined,
				validUntil: String(f.get('validUntil') ?? '') || undefined,
				taxCode: (String(f.get('taxCode') ?? '') as any) || undefined,
				discountPct: Number(f.get('discountPct') ?? 0) || 0,
				taxAmount: Number(f.get('taxAmount') ?? 0) || 0,
				notes: String(f.get('notes') ?? '') || undefined,
				items: lines.map((l) => ({
					itemCode: l.itemCode || undefined,
					description: l.description,
					quantity: Number(l.quantity) || 1,
					unitPrice: Number(l.unitPrice) || 0,
					discountPct: Number(l.discountPct) || 0
				}))
			});
			id = result.id;
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
		throw redirect(303, `/sales-crm/quotations/${id}`);
	}
};
