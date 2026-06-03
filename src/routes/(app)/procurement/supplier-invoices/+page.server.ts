import type { Actions, PageServerLoad } from './$types';

import { fail } from '@sveltejs/kit';
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

function parseLineRows(form: FormData) {
	const poItemIds = form.getAll('lineItemPoItemId').map(String);
	const descriptions = form.getAll('lineItemDescription').map(String);
	const itemCodes = form.getAll('lineItemCode').map(String);
	const quantities = form.getAll('lineItemQuantity').map(String);
	const unitPrices = form.getAll('lineItemUnitPrice').map(String);
	const taxCodes = form.getAll('lineItemTaxCode').map(String);
	const notes = form.getAll('lineItemNotes').map(String);
	const max = Math.max(
		poItemIds.length,
		descriptions.length,
		itemCodes.length,
		quantities.length,
		unitPrices.length
	);
	const lines = [];
	for (let i = 0; i < max; i += 1) {
		const description = (descriptions[i] ?? '').trim();
		const itemCode = (itemCodes[i] ?? '').trim();
		const poItemId = (poItemIds[i] ?? '').trim();
		const quantity = Number(quantities[i]);
		const unitPrice = Number(unitPrices[i]);
		if (!description && !itemCode && !poItemId) continue;
		if (!Number.isFinite(quantity) || quantity <= 0) continue;
		lines.push({
			poItemId: poItemId || undefined,
			description: description || itemCode || 'Line item',
			itemCode: itemCode || undefined,
			quantityInvoiced: quantity,
			unitPriceInvoiced: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0,
			taxCode: (taxCodes[i] || undefined) as 'SR' | 'ZR' | 'ES' | 'OP' | undefined,
			notes: (notes[i] ?? '').trim() || undefined
		});
	}
	return lines;
}

export const load: PageServerLoad = async (event) => {
	const selectedInvoiceId = event.url.searchParams.get('invoice') ?? '';
	if (!event.platform) {
		return {
			invoices: [],
			suppliers: [],
			purchaseOrders: [],
			selectedInvoiceId,
			selectedInvoice: null
		};
	}
	const ctx = await createModuleContext(event);
	const procurement = createProcurementApi(ctx);
	const [invoices, suppliers, purchaseOrders] = await Promise.all([
		procurement.listSupplierInvoices(),
		procurement.listSuppliers(),
		procurement.listPurchaseOrders()
	]);
	const selectedInvoice = selectedInvoiceId
		? await procurement.getSupplierInvoiceDetail(selectedInvoiceId).catch(() => null)
		: null;
	return { invoices, suppliers, purchaseOrders, selectedInvoiceId, selectedInvoice };
};

export const actions: Actions = {
	createInvoice: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const form = await event.request.formData();
		const invoiceNumber = text(form, 'invoiceNumber');
		if (!invoiceNumber) return fail(400, { error: 'Supplier invoice number is required' });
		const lines = parseLineRows(form);
		if (lines.length === 0) return fail(400, { error: 'Add at least one invoice line' });
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		try {
			await procurement.createSupplierInvoice({
				invoiceNumber,
				supplierId: text(form, 'supplierId'),
				poId: text(form, 'poId'),
				projectId: text(form, 'projectId'),
				invoiceDate: text(form, 'invoiceDate'),
				receivedDate: text(form, 'receivedDate'),
				dueDate: text(form, 'dueDate'),
				currency: text(form, 'currency') ?? 'SGD',
				shippingAmount: num(form, 'shippingAmount'),
				taxAmount: num(form, 'taxAmount'),
				dutiesAmount: num(form, 'dutiesAmount'),
				discountAmount: num(form, 'discountAmount'),
				notes: text(form, 'notes'),
				lines
			});
		} catch (err) {
			return fail(400, { error: (err as Error).message });
		}
		return { success: true };
	},

	decideInvoice: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const form = await event.request.formData();
		const invoiceId = text(form, 'invoiceId');
		const action = text(form, 'action') as
			| 'approve'
			| 'reject'
			| 'override_approve'
			| undefined;
		if (!invoiceId || !action) return fail(400, { error: 'Missing invoice or action' });
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		try {
			await procurement.recordSupplierInvoiceDecision(invoiceId, {
				action,
				reason: text(form, 'reason')
			});
		} catch (err) {
			return fail(400, { error: (err as Error).message });
		}
		return { success: true };
	},

	rematchInvoice: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const form = await event.request.formData();
		const invoiceId = text(form, 'invoiceId');
		if (!invoiceId) return fail(400, { error: 'Missing invoice' });
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		try {
			await procurement.runSupplierInvoiceRematch(invoiceId);
		} catch (err) {
			return fail(400, { error: (err as Error).message });
		}
		return { success: true };
	}
};
