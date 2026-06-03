import type { Actions, PageServerLoad } from './$types';

import { error, fail } from '@sveltejs/kit';
import { createProcurementApi } from '$modules/procurement';
import { createModuleContext } from '$platform/modules';

function text(form: FormData, key: string) {
	const value = String(form.get(key) ?? '').trim();
	return value || undefined;
}

function num(form: FormData, key: string) {
	const value = Number(form.get(key));
	return Number.isFinite(value) ? value : undefined;
}

export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		error(503, 'Platform unavailable');
	}
	const ctx = await createModuleContext(event);
	const procurement = createProcurementApi(ctx);
	const comparison = await procurement.getRfqComparison(event.params.id);
	return { comparison };
};

export const actions: Actions = {
	submitQuotation: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const form = await event.request.formData();
		const supplierId = text(form, 'supplierId');
		if (!supplierId) return fail(400, { error: 'Missing supplier' });
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		const comparison = await procurement.getRfqComparison(event.params.id);
		const items = comparison.items
			.map((item) => ({
				rfqItemId: item.id,
				quantity: num(form, `qty_${item.id}`) ?? Number(item.quantity ?? 1),
				unitPrice: num(form, `price_${item.id}`) ?? 0
			}))
			.filter((item) => item.unitPrice > 0);
		if (items.length === 0) return fail(400, { error: 'Enter at least one item price' });
		await procurement.submitSupplierQuotation(event.params.id, {
			supplierId,
			quotationNumber: text(form, 'quotationNumber'),
			submittedAt: text(form, 'submittedAt'),
			currency: text(form, 'currency') ?? comparison.rfq.currency,
			leadTimeDays: num(form, 'leadTimeDays'),
			deliveryTerms: text(form, 'deliveryTerms'),
			paymentTerms: text(form, 'paymentTerms'),
			validityDate: text(form, 'validityDate'),
			shippingAmount: num(form, 'shippingAmount'),
			taxAmount: num(form, 'taxAmount'),
			dutiesAmount: num(form, 'dutiesAmount'),
			discountAmount: num(form, 'discountAmount'),
			notes: text(form, 'notes'),
			items
		});
		return { success: true };
	},

	selectWinner: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const form = await event.request.formData();
		const quotationId = text(form, 'quotationId');
		if (!quotationId) return fail(400, { error: 'Missing quotation' });
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		await procurement.selectWinningQuotation(event.params.id, {
			quotationId,
			poNumber: text(form, 'poNumber'),
			poDate: text(form, 'poDate'),
			goodsReceiptDate: text(form, 'goodsReceiptDate'),
			deliveryDate: text(form, 'deliveryDate'),
			taxCode: text(form, 'taxCode') as 'SR' | 'ZR' | 'ES' | 'OP' | undefined,
			incoterms: text(form, 'incoterms'),
			billingAddress: text(form, 'billingAddress'),
			status:
				(text(form, 'status') as
					| 'draft'
					| 'pending_approval'
					| 'approved'
					| 'sent'
					| 'confirmed'
					| 'received') ?? 'draft',
			notes: text(form, 'notes')
		});
		return { success: true };
	}
};
