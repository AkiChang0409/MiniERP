import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createModuleContext } from '$platform/modules';
import { createSalesCrmApi } from '$modules/sales-crm';
import { createInventoryApi } from '$modules/inventory';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) return { customers: [], stockCells: [] };
	const ctx = await createModuleContext(event);
	const salesCrm = createSalesCrmApi(ctx);
	const inventory = createInventoryApi(ctx);
	const [customers, levels] = await Promise.all([
		salesCrm.listCustomerOptions(),
		inventory.listStockLevels({})
	]);
	const stockCells = levels.map((l: any) => ({
		itemId: l.level.itemId,
		warehouseId: l.level.warehouseId,
		binLocationId: l.level.binLocationId,
		itemCode: l.item?.code ?? null,
		itemName: l.item?.name ?? l.level.itemId,
		warehouseName: l.warehouse?.name ?? '',
		binCode: l.bin?.code ?? '',
		available: Number(l.level.quantityOnHand) - Number(l.level.quantityReserved),
		unitPrice: Number(l.item?.standardPrice ?? l.item?.lastCost ?? 0)
	}));
	return { customers, stockCells };
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
		let orderId: string;
		try {
			const result = await salesCrm.createSalesOrder({
				customerId,
				orderDate: String(f.get('orderDate') ?? '') || undefined,
				requestedDeliveryDate: String(f.get('requestedDeliveryDate') ?? '') || undefined,
				taxCode: (String(f.get('taxCode') ?? '') as any) || undefined,
				discountPct: Number(f.get('discountPct') ?? 0) || 0,
				shippingAmount: Number(f.get('shippingAmount') ?? 0) || 0,
				taxAmount: Number(f.get('taxAmount') ?? 0) || 0,
				billingAddress: String(f.get('billingAddress') ?? '') || undefined,
				shippingAddress: String(f.get('shippingAddress') ?? '') || undefined,
				notes: String(f.get('notes') ?? '') || undefined,
				items: lines.map((l) => ({
					itemId: l.itemId || undefined,
					itemCode: l.itemCode || undefined,
					description: l.description,
					quantity: Number(l.quantity) || 1,
					unitPrice: Number(l.unitPrice) || 0,
					discountPct: Number(l.discountPct) || 0,
					warehouseId: l.warehouseId || undefined,
					binLocationId: l.binLocationId || undefined
				}))
			});
			orderId = result.id;
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
		throw redirect(303, `/sales-crm/orders/${orderId}`);
	}
};
